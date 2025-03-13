/**
 * Скрипт для перевірки доступності доменів Nad Domains
 */

require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('../config');

// Адреса контракту Nad Domains
const NAD_DOMAINS_CONTRACT = '0x2cc8342d7c8bff5a213857a90a6bf5f557ae2647';

// ABI контракту Nad Domains (тільки для перевірки доступності)
const NAD_DOMAINS_ABI = [
  "function available(string name) view returns (bool)"
];

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

// Функція для перевірки доступності домену
async function checkDomainAvailability(provider, domainName) {
  try {
    console.log(`Checking if domain ${domainName}.nad is available...`.cyan);
    
    // Створюємо контракт
    const contract = new ethers.Contract(
      NAD_DOMAINS_CONTRACT,
      NAD_DOMAINS_ABI,
      provider
    );
    
    // Перевіряємо доступність домену
    const isAvailable = await contract.available(domainName);
    
    if (isAvailable) {
      console.log(`Domain ${domainName}.nad is available!`.green);
      return true;
    } else {
      console.log(`Domain ${domainName}.nad is already taken.`.yellow);
      return false;
    }
  } catch (error) {
    console.log(`Error checking domain availability: ${error.message}`.red);
    return false;
  }
}

// Головна функція
async function main() {
  try {
    // Отримуємо проксі з конфігурації
    const proxies = config.PROXIES;

    if (proxies.length === 0) {
      console.error('Please ensure PROXIES are configured in config.js'.red);
      process.exit(1);
    }

    // Використовуємо перший проксі
    const proxy = proxies[0].trim();

    // Створюємо провайдер
    const provider = createProvider(proxy);

    console.log(`Connected to RPC: ${config.RPC_URL}`.cyan);

    // Список доменів для перевірки
    const domains = [
      'test123',
      'monad',
      'crypto',
      'blockchain',
      'web3',
      'defi',
      'nft',
      'dao',
      'wallet',
      'exchange'
    ];

    console.log(`\nChecking availability for ${domains.length} domains...`.yellow);

    // Перевіряємо кожен домен
    for (const domain of domains) {
      await checkDomainAvailability(provider, domain);
    }

    // Генеруємо випадкові домени
    console.log(`\nGenerating and checking 5 random domains...`.yellow);
    
    for (let i = 0; i < 5; i++) {
      // Генеруємо випадкове ім'я домену (5-10 символів)
      const length = Math.floor(Math.random() * 6) + 5;
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let domainName = '';
      
      for (let j = 0; j < length; j++) {
        domainName += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      await checkDomainAvailability(provider, domainName);
    }

    console.log('\nDomain availability check completed!'.green.bold);
  } catch (error) {
    console.error(`Error occurred: ${error.message}`.red);
  }
}

// Запускаємо головну функцію
main(); 