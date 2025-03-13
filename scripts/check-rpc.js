/**
 * Скрипт для перевірки доступності різних RPC-серверів
 */

require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('../config');

// Список RPC-серверів для перевірки
const RPC_URLS = [
  config.RPC_URL,
  ...(config.ALTERNATIVE_RPC_URLS || []),
  // Додаткові публічні RPC-сервери для Monad
  'https://rpc.monad.xyz',
  'https://monad-mainnet-rpc.dwellir.com',
  'https://monad.drpc.org',
  'https://monad-mainnet.public.blastapi.io'
];

// Функція для створення провайдера з проксі
function createProvider(rpcUrl, proxy = null) {
  const options = {
    url: rpcUrl,
    timeout: config.RPC_TIMEOUT || 30000
  };

  if (proxy) {
    options.headers = {
      'Proxy-Authorization': `Basic ${Buffer.from(
        proxy.split('@')[0]
      ).toString('base64')}`,
    };
  }

  return new ethers.providers.JsonRpcProvider(options);
}

// Функція для перевірки RPC-сервера
async function checkRpc(rpcUrl, proxy = null) {
  console.log(`\n🔄 Testing RPC: ${rpcUrl}`.yellow);
  
  try {
    const provider = createProvider(rpcUrl, proxy);
    
    console.log('Checking connection...'.cyan);
    const startTime = Date.now();
    const blockNumber = await provider.getBlockNumber();
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`✅ Connected to RPC: ${rpcUrl}`.green);
    console.log(`📊 Current block number: ${blockNumber}`.cyan);
    console.log(`⏱️ Response time: ${responseTime}ms`.cyan);
    
    // Перевіряємо баланс тестового гаманця
    console.log('Checking balance of test address...'.cyan);
    const testAddress = '0xd1Ae3ea6e2f5eA443427b0C6bfCD1b0daD68289e'; // Використовуємо адресу з попередніх тестів
    const balanceStart = Date.now();
    const balance = await provider.getBalance(testAddress);
    const balanceEnd = Date.now();
    const balanceResponseTime = balanceEnd - balanceStart;
    
    console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} MON`.cyan);
    console.log(`⏱️ Balance check response time: ${balanceResponseTime}ms`.cyan);
    
    return {
      rpcUrl,
      success: true,
      blockNumber,
      responseTime,
      balanceResponseTime
    };
  } catch (error) {
    console.log(`❌ Failed to connect to RPC: ${rpcUrl}`.red);
    console.log(`Error: ${error.message}`.red);
    
    return {
      rpcUrl,
      success: false,
      error: error.message
    };
  }
}

// Головна функція
async function main() {
  console.log('🔍 Starting RPC availability check...'.cyan.bold);
  
  const results = [];
  
  // Перевіряємо кожен RPC-сервер без проксі
  console.log('\n=== Testing without proxy ==='.yellow.bold);
  for (const rpcUrl of RPC_URLS) {
    const result = await checkRpc(rpcUrl);
    results.push(result);
  }
  
  // Перевіряємо з проксі, якщо вони налаштовані
  if (config.PROXIES && config.PROXIES.length > 0) {
    const proxy = config.PROXIES[0].trim();
    console.log(`\n=== Testing with proxy: ${proxy} ===`.yellow.bold);
    
    for (const rpcUrl of RPC_URLS) {
      const result = await checkRpc(rpcUrl, proxy);
      results.push({...result, proxy});
    }
  }
  
  // Виводимо підсумок
  console.log('\n=== Summary ==='.cyan.bold);
  
  const successfulRpcs = results.filter(r => r.success);
  console.log(`Total RPC servers tested: ${results.length}`.cyan);
  console.log(`Successful connections: ${successfulRpcs.length}`.green);
  console.log(`Failed connections: ${results.length - successfulRpcs.length}`.red);
  
  if (successfulRpcs.length > 0) {
    // Сортуємо за часом відповіді
    const sortedRpcs = [...successfulRpcs].sort((a, b) => a.responseTime - b.responseTime);
    
    console.log('\n=== Fastest RPC Servers ==='.green.bold);
    sortedRpcs.slice(0, 3).forEach((rpc, index) => {
      const proxyInfo = rpc.proxy ? ` (with proxy: ${rpc.proxy})` : ' (without proxy)';
      console.log(`${index + 1}. ${rpc.rpcUrl}${proxyInfo} - ${rpc.responseTime}ms`.green);
    });
    
    // Рекомендації для конфігурації
    console.log('\n=== Recommended Configuration ==='.yellow.bold);
    console.log('Add these RPC URLs to your config.js:'.cyan);
    console.log(`
config.RPC_URL = '${sortedRpcs[0].rpcUrl}';
config.ALTERNATIVE_RPC_URLS = [
  '${sortedRpcs.length > 1 ? sortedRpcs[1].rpcUrl : sortedRpcs[0].rpcUrl}',
  '${sortedRpcs.length > 2 ? sortedRpcs[2].rpcUrl : sortedRpcs[0].rpcUrl}'
];
`.green);
  }
}

// Запускаємо головну функцію
main(); 