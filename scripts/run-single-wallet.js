/**
 * Скрипт для запуску модуля тільки для одного гаманця
 */

require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('../config');
const magicedenMint = require('./magiceden-mint');
const nadDomains = require('./nad-domains');

// Індекс гаманця, який буде використовуватись (0-9)
const WALLET_INDEX = 0;

// Функція для створення затримки
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функція для створення провайдера з проксі
function createProvider(proxy, rpcUrl = config.RPC_URL) {
  const proxyAuth = proxy.split('@')[0];
  
  return new ethers.providers.JsonRpcProvider({
    url: rpcUrl,
    headers: {
      'Proxy-Authorization': `Basic ${Buffer.from(proxyAuth).toString('base64')}`,
    },
    timeout: config.RPC_TIMEOUT || 30000
  });
}

// Функція для перемикання між RPC-серверами
async function switchRpcProvider(proxy) {
  const alternativeRpcUrls = config.ALTERNATIVE_RPC_URLS || [config.RPC_URL];
  
  for (const rpcUrl of alternativeRpcUrls) {
    console.log(`🔄 Trying RPC: ${rpcUrl}`.yellow);
    
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

// Головна функція
async function main() {
  try {
    // Отримуємо гаманці та проксі з конфігурації
    const wallets = config.WALLETS;
    const proxies = config.PROXIES;

    if (wallets.length === 0 || proxies.length === 0) {
      console.error('Please ensure WALLETS and PROXIES are configured in config.js'.red);
      process.exit(1);
    }

    // Перевіряємо, чи індекс гаманця в межах масиву
    if (WALLET_INDEX < 0 || WALLET_INDEX >= wallets.length) {
      console.error(`Invalid wallet index: ${WALLET_INDEX}. Must be between 0 and ${wallets.length - 1}`.red);
      process.exit(1);
    }

    // Отримуємо приватний ключ та проксі для вибраного гаманця
    const privateKey = wallets[WALLET_INDEX].trim();
    const proxy = proxies[WALLET_INDEX % proxies.length].trim();

    // Спробуємо знайти доступний RPC-сервер
    let provider;
    try {
      provider = await switchRpcProvider(proxy);
    } catch (error) {
      console.error(`Failed to connect to any RPC server: ${error.message}`.red);
      process.exit(1);
    }

    // Створюємо гаманець
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Starting operations for account ${wallet.address} using proxy ${proxy}`.cyan);
    
    // Перевіряємо баланс гаманця
    const balance = await wallet.getBalance();
    console.log(`Current balance: ${ethers.utils.formatEther(balance)} MON`.cyan);

    // Запитуємо користувача, який модуль запустити
    console.log('\nSelect module to run:'.yellow);
    console.log('1. MagicEden NFT Mint'.cyan);
    console.log('2. Nad Domains Registration'.cyan);

    // Оскільки ми не можемо отримати введення користувача в цьому середовищі,
    // запускаємо модуль Nad Domains Registration
    console.log('\nRunning Nad Domains Registration module...'.green);
    
    // Додаємо затримку перед запуском
    console.log('Waiting 5 seconds before starting...'.yellow);
    await sleep(5000);
    
    // Генеруємо випадкове ім'я домену (5-10 символів)
    const length = Math.floor(Math.random() * 6) + 5;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let domainName = '';
    
    for (let i = 0; i < length; i++) {
      domainName += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    console.log(`Generated random domain name: ${domainName}.nad`.cyan);
    
    // Реєструємо домен напряму, без запуску всього модуля
    const registrationYears = 1;
    const success = await nadDomains.registerDomain(wallet, domainName, registrationYears, proxy);
    
    if (success) {
      console.log(`\n✅ Domain ${domainName}.nad successfully registered!`.green.bold);
    } else {
      console.log(`\n❌ Failed to register domain ${domainName}.nad`.red);
    }

    console.log('\nOperation completed!'.green.bold);
  } catch (error) {
    console.error(`Error occurred: ${error.message}`.red);
  }
}

// Запускаємо головну функцію
main(); 