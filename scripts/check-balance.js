/**
 * Скрипт для перевірки балансу гаманця
 */

require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('../config');

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

// Функція для перевірки балансу гаманця
async function checkBalance(provider, address) {
  try {
    console.log(`Checking balance for address: ${address}`.cyan);
    
    const balance = await provider.getBalance(address);
    console.log(`Balance: ${ethers.utils.formatEther(balance)} MON`.green);
    
    return balance;
  } catch (error) {
    console.log(`Error checking balance: ${error.message}`.red);
    return ethers.BigNumber.from(0);
  }
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

    // Створюємо провайдер з першим проксі
    const proxy = proxies[0].trim();
    const provider = createProvider(proxy);

    console.log(`Connected to RPC: ${config.RPC_URL}`.cyan);
    console.log(`Using proxy: ${proxy}`.cyan);

    // Перевіряємо баланс для кожного гаманця
    console.log(`\nChecking balances for ${wallets.length} wallets...`.yellow);

    for (let i = 0; i < wallets.length; i++) {
      const privateKey = wallets[i].trim();
      const wallet = new ethers.Wallet(privateKey);
      
      console.log(`\nWallet ${i + 1}:`.yellow);
      await checkBalance(provider, wallet.address);
    }

    console.log('\nBalance check completed!'.green.bold);
  } catch (error) {
    console.error(`Error occurred: ${error.message}`.red);
  }
}

// Запускаємо головну функцію
main(); 