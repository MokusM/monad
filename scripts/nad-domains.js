/**
 * Модуль для реєстрації доменів на Nad Domains в мережі Monad testnet
 * Адаптовано з репозиторію 0xStarLabs/StarLabs-Monad
 */

require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('../config');
const walletUtils = require('../utils/wallet-utils');

// Адреса контракту Nad Domains
const NAD_DOMAINS_CONTRACT = '0x3019BF1dfB84E5b46Ca9D0eEC37dE08a59A41308';

// ABI контракту Nad Domains
const NAD_DOMAINS_ABI = [
  // Функція для перевірки доступності домену
  "function isAvailable(string name) view returns (bool)",
  
  // Функція для отримання ціни домену
  "function price(string name, uint256 duration) view returns (uint256)",
  
  // Функція для реєстрації домену
  "function register(string name, uint256 duration) payable returns (uint256)",
  
  // Функція для отримання кількості доменів у гаманця
  "function balanceOf(address owner) view returns (uint256)"
];

// Функція для створення затримки
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функція для отримання випадкової затримки між min та max секунд
function getRandomDelay(min = config.DELAYS.MIN_DELAY, max = config.DELAYS.MAX_DELAY) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

// Функція для виведення інформації про затримку
async function delay(min = config.DELAYS.MIN_DELAY, max = config.DELAYS.MAX_DELAY) {
  const delayTime = getRandomDelay(min, max);
  console.log(`⏳ Waiting for ${delayTime / 1000} seconds...`.yellow);
  await sleep(delayTime);
  console.log(`✅ Delay completed`.green);
}

// Функція для створення провайдера з проксі
function createProvider(proxy, rpcUrl = config.RPC_URL) {
  return new ethers.providers.JsonRpcProvider({
    url: rpcUrl,
    headers: {
      'Proxy-Authorization': `Basic ${Buffer.from(
        proxy.split('@')[0]
      ).toString('base64')}`,
    },
    timeout: config.RPC_TIMEOUT || 30000
  });
}

// Функція для перемикання між RPC-серверами
async function switchRpcProvider(proxy) {
  const alternativeRpcUrls = config.ALTERNATIVE_RPC_URLS || [config.RPC_URL];
  
  for (const rpcUrl of alternativeRpcUrls) {
    console.log(`🔄 Switching to RPC: ${rpcUrl}`.yellow);
    
    try {
      const provider = createProvider(proxy, rpcUrl);
      
      // Перевіряємо підключення
      await provider.getBlockNumber();
      console.log(`✅ Connected to RPC: ${rpcUrl}`.green);
      
      return provider;
    } catch (error) {
      console.log(`❌ Failed to connect to RPC: ${rpcUrl}`.red);
    }
  }
  
  throw new Error('All RPC servers are unavailable');
}

// Функція для повторних спроб виконання функції
async function retry(fn, maxRetries = config.RPC_RETRY_COUNT || 3, retryDelay = 2000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`⚠️ Attempt ${i + 1}/${maxRetries} failed: ${error.message}`.yellow);
      
      if (error.code === 'SERVER_ERROR' || error.message.includes('bad response')) {
        console.log(`🔄 RPC server issue detected, waiting before retry...`.yellow);
      }
      
      if (i < maxRetries - 1) {
        await sleep(retryDelay);
      }
    }
  }
  
  throw lastError;
}

// Функція для перевірки балансу MON
async function checkBalance(wallet) {
  return retry(async () => {
    const balance = await wallet.getBalance();
    console.log(`💰 Current balance: ${ethers.utils.formatEther(balance)} MON`.cyan);
    return balance;
  });
}

// Функція для генерації випадкового імені домену
function generateRandomDomainName(length = 8) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Функція для перевірки доступності домену
async function checkDomainAvailability(wallet, domainName, proxy) {
  try {
    console.log(`Checking if domain ${domainName}.nad is available...`.cyan);
    
    // Створюємо контракт
    const contract = new ethers.Contract(
      NAD_DOMAINS_CONTRACT,
      NAD_DOMAINS_ABI,
      wallet
    );
    
    // Перевіряємо доступність домену
    const isAvailable = await contract.isAvailable(domainName);
    
    if (isAvailable) {
      console.log(`Domain ${domainName}.nad is available!`.green);
      return true;
    } else {
      console.log(`Domain ${domainName}.nad is already taken.`.yellow);
      return false;
    }
  } catch (error) {
    console.log(`Error checking domain availability: ${error.message}`.red);
    
    // Якщо помилка пов'язана з RPC, спробуємо перемкнутися на інший RPC
    if (error.message.includes('SERVER_ERROR') || 
        error.message.includes('CALL_EXCEPTION') || 
        error.message.includes('TIMEOUT')) {
      console.log('Trying to switch RPC provider...'.yellow);
      
      try {
        // Створюємо новий провайдер
        const newProvider = await switchRpcProvider(proxy);
        
        // Створюємо новий гаманець з новим провайдером
        const newWallet = new ethers.Wallet(wallet.privateKey, newProvider);
        
        // Рекурсивно викликаємо функцію з новим гаманцем
        return await checkDomainAvailability(newWallet, domainName, proxy);
      } catch (switchError) {
        console.log(`Failed to switch RPC provider: ${switchError.message}`.red);
      }
    }
    
    return false;
  }
}

// Функція для отримання ціни домену
async function getDomainPrice(wallet, domainName, registrationYears = 1) {
  try {
    console.log(`Getting price for domain ${domainName}.nad for ${registrationYears} year(s)...`.cyan);
    
    // Створюємо контракт
    const contract = new ethers.Contract(
      NAD_DOMAINS_CONTRACT,
      NAD_DOMAINS_ABI,
      wallet
    );
    
    // Отримуємо ціну домену
    const price = await contract.price(domainName, registrationYears);
    
    console.log(`Price for ${domainName}.nad for ${registrationYears} year(s): ${ethers.utils.formatEther(price)} MON`.cyan);
    
    return price;
  } catch (error) {
    console.log(`Error getting domain price: ${error.message}`.red);
    
    // Якщо помилка пов'язана з RPC, спробуємо перемкнутися на інший RPC
    if (error.message.includes('SERVER_ERROR') || 
        error.message.includes('CALL_EXCEPTION') || 
        error.message.includes('TIMEOUT')) {
      console.log('Trying to switch RPC provider...'.yellow);
      
      try {
        // Створюємо новий провайдер
        const newProvider = await switchRpcProvider(proxy);
        
        // Створюємо новий гаманець з новим провайдером
        const newWallet = new ethers.Wallet(wallet.privateKey, newProvider);
        
        // Рекурсивно викликаємо функцію з новим гаманцем
        return await getDomainPrice(newWallet, domainName, registrationYears);
      } catch (switchError) {
        console.log(`Failed to switch RPC provider: ${switchError.message}`.red);
      }
    }
    
    return ethers.BigNumber.from(0);
  }
}

// Функція для реєстрації домену
async function registerDomain(wallet, domainName, registrationYears = 1, proxy) {
  try {
    console.log(`Registering domain ${domainName}.nad for ${registrationYears} year(s)...`.cyan);
    
    // Перевіряємо доступність домену
    const isAvailable = await checkDomainAvailability(wallet, domainName, proxy);
    
    if (!isAvailable) {
      console.log(`Cannot register domain ${domainName}.nad as it is not available.`.red);
      return false;
    }
    
    // Отримуємо ціну домену
    const price = await getDomainPrice(wallet, domainName, registrationYears);
    
    if (price.eq(0)) {
      console.log(`Failed to get price for domain ${domainName}.nad`.red);
      return false;
    }
    
    // Перевіряємо баланс гаманця
    const balance = await wallet.getBalance();
    
    if (balance.lt(price)) {
      console.log(`Insufficient balance to register domain ${domainName}.nad`.red);
      console.log(`Required: ${ethers.utils.formatEther(price)} MON, Available: ${ethers.utils.formatEther(balance)} MON`.red);
      return false;
    }
    
    // Створюємо контракт
    const contract = new ethers.Contract(
      NAD_DOMAINS_CONTRACT,
      NAD_DOMAINS_ABI,
      wallet
    );
    
    // Налаштовуємо газ
    const gasPrice = ethers.utils.parseUnits(config.GAS.GAS_PRICE || "1.5", 'gwei');
    const gasLimit = config.GAS.DEFAULT_GAS_LIMIT || 500000;
    
    // Реєструємо домен
    console.log(`Sending transaction to register domain ${domainName}.nad...`.cyan);
    
    const tx = await contract.register(
      domainName,
      registrationYears,
      {
        value: price,
        gasPrice,
        gasLimit
      }
    );
    
    console.log(`Transaction sent! Hash: ${tx.hash}`.green);
    
    // Чекаємо підтвердження транзакції
    console.log('Waiting for transaction confirmation...'.yellow);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`Domain ${domainName}.nad successfully registered!`.green.bold);
      return true;
    } else {
      console.log(`Failed to register domain ${domainName}.nad`.red);
      return false;
    }
  } catch (error) {
    console.log(`Error registering domain: ${error.message}`.red);
    
    // Якщо помилка пов'язана з RPC, спробуємо перемкнутися на інший RPC
    if (error.message.includes('SERVER_ERROR') || 
        error.message.includes('CALL_EXCEPTION') || 
        error.message.includes('TIMEOUT')) {
      console.log('Trying to switch RPC provider...'.yellow);
      
      try {
        // Створюємо новий провайдер
        const newProvider = await switchRpcProvider(proxy);
        
        // Створюємо новий гаманець з новим провайдером
        const newWallet = new ethers.Wallet(wallet.privateKey, newProvider);
        
        // Рекурсивно викликаємо функцію з новим гаманцем
        return await registerDomain(newWallet, domainName, registrationYears, proxy);
      } catch (switchError) {
        console.log(`Failed to switch RPC provider: ${switchError.message}`.red);
      }
    }
    
    return false;
  }
}

module.exports = {
  checkDomainAvailability,
  getDomainPrice,
  registerDomain
};