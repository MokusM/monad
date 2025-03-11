/**
 * Модуль для реєстрації доменів на Nad Domains в мережі Monad testnet
 * Адаптовано з репозиторію 0xStarLabs/StarLabs-Monad
 */

require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('../config');
const walletUtils = require('../utils/wallet-utils');

// Контракт Nad Domains
const NAD_DOMAINS_CONTRACT = '0x2Cc8342d7c8BFf5A213857A90a6Bf5f557Ae2647';

// ABI для реєстрації доменів
const NAD_DOMAINS_ABI = [
  'function register(string memory name, uint256 duration) external payable',
  'function price(string memory name, uint256 duration) external view returns (uint256)',
  'function available(string memory name) external view returns (bool)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function getName(uint256 tokenId) external view returns (string memory)'
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
async function checkDomainAvailability(contract, domainName) {
  try {
    const isAvailable = await contract.available(domainName);
    return isAvailable;
  } catch (error) {
    console.error(`❌ Error checking domain availability:`.red, error.message);
    return false;
  }
}

// Функція для отримання ціни реєстрації домену
async function getDomainPrice(contract, domainName, duration) {
  try {
    const price = await contract.price(domainName, duration);
    return price;
  } catch (error) {
    console.error(`❌ Error getting domain price:`.red, error.message);
    return ethers.BigNumber.from(0);
  }
}

// Функція для реєстрації домену
async function registerDomain(wallet, domainName, duration = 365) {
  try {
    const contract = new ethers.Contract(NAD_DOMAINS_CONTRACT, NAD_DOMAINS_ABI, wallet);
    
    // Перевіряємо доступність домену
    const isAvailable = await checkDomainAvailability(contract, domainName);
    if (!isAvailable) {
      console.log(`🔴 Domain ${domainName}.nad is not available`.red);
      return false;
    }
    
    console.log(`🟢 Domain ${domainName}.nad is available`.green);
    
    // Отримуємо ціну реєстрації
    const price = await getDomainPrice(contract, domainName, duration);
    console.log(`💰 Registration price for ${duration} days: ${ethers.utils.formatEther(price)} MON`.cyan);
    
    // Підготовка транзакції
    const tx = await contract.register(domainName, duration, {
      value: price,
      gasLimit: 500000
    });
    
    console.log(`✔️ Domain registration transaction sent`.green.underline);
    console.log(`➡️ Transaction hash: ${tx.hash}`.yellow);
    
    // Очікуємо підтвердження транзакції
    const receipt = await tx.wait();
    
    // Перевіряємо баланс доменів після реєстрації
    const balance = await contract.balanceOf(wallet.address);
    
    console.log(`✅ Domain registration successful! Current balance: ${balance.toString()} domains`.green);
    
    // Виводимо інформацію про зареєстровані домени
    if (balance.gt(0)) {
      const lastTokenId = await contract.tokenOfOwnerByIndex(wallet.address, balance.sub(1));
      const domainName = await contract.getName(lastTokenId);
      console.log(`🌐 Last registered domain: ${domainName}.nad`.cyan);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error registering domain:`.red, error.message);
    return false;
  }
}

// Головна функція для реєстрації домену
async function runDomainRegistration(wallet) {
  try {
    console.log(`Starting Nad Domains registration operation:`.magenta);
    
    // Генеруємо випадкове ім'я домену
    const domainName = generateRandomDomainName();
    console.log(`🌐 Generated domain name: ${domainName}.nad`.cyan);
    
    // Визначаємо тривалість реєстрації (від 30 до 365 днів)
    const duration = Math.floor(Math.random() * (365 - 30 + 1)) + 30;
    console.log(`⏱️ Registration duration: ${duration} days`.cyan);
    
    // Реєструємо домен
    await registerDomain(wallet, domainName, duration);
    
    console.log(`Nad Domains registration operation completed`.green);
    return true;
  } catch (error) {
    console.error(`❌ Nad Domains registration operation failed: ${error.message}`.red);
    return false;
  }
}

// Експортуємо функцію для використання в головному файлі
module.exports = {
  runDomainRegistration
};

// Якщо скрипт запущено напряму, виконуємо основну функцію
if (require.main === module) {
  // Отримуємо гаманці з конфігурації
  const wallets = config.WALLETS;
  
  // Отримуємо проксі з конфігурації
  const proxies = config.PROXIES;

  if (wallets.length === 0 || proxies.length === 0) {
    console.error('Please ensure WALLETS and PROXIES are configured in config.js'.red);
    process.exit(1);
  }

  async function main() {
    console.log(`Starting Nad Domains registration operations for all accounts...`);

    // Виконуємо операції для кожного гаманця
    for (let i = 0; i < wallets.length; i++) {
      const privateKey = wallets[i].trim();
      const proxy = proxies[i % proxies.length].trim();

      const provider = new ethers.providers.JsonRpcProvider({
        url: config.RPC_URL,
        headers: {
          'Proxy-Authorization': `Basic ${Buffer.from(
            proxy.split('@')[0]
          ).toString('base64')}`,
        },
      });

      const wallet = new ethers.Wallet(privateKey, provider);

      console.log(
        `\nStarting operations for account ${wallet.address} using proxy ${proxy}`
          .cyan
      );

      await runDomainRegistration(wallet);
      
      // Додаємо затримку між гаманцями
      if (i < wallets.length - 1) {
        console.log(`\nMoving to next wallet...`.cyan);
        await delay(60, 600); // Затримка 1-10 хвилин між гаманцями
      }
    }

    console.log(`\nAll operations completed successfully!`.green.bold);
  }

  main().catch((error) => {
    console.error('Error occurred:', error);
  });
} 