/**
 * Простий скрипт для перевірки підключення до RPC без проксі
 */

const { ethers } = require('ethers');
const colors = require('colors');

// Список RPC-серверів для перевірки
const RPC_URLS = [
  'https://testnet-rpc.monad.xyz/',
  'https://rpc-testnet.monad.network/'
];

// Контракти для перевірки
const CONTRACTS_TO_CHECK = [
  {
    name: 'Nad Domains (old)',
    address: '0x2cc8342d7c8bff5a213857a90a6bf5f557ae2647'
  },
  {
    name: 'Nad Domains (new)',
    address: '0x3019BF1dfB84E5b46Ca9D0eEC37dE08a59A41308'
  },
  {
    name: 'MagicEden NFT 1',
    address: '0x4269cde9751237634d972026583bd39dff10b6f8'
  },
  {
    name: 'MagicEden NFT 2',
    address: '0xb3b63ea6ad288f74c1268a50640919fadae84454'
  },
  {
    name: 'MagicEden NFT 3',
    address: '0xbf5340ac35c0653e4f30a52bca8de137bb717b56'
  },
  {
    name: 'MagicEden NFT 4',
    address: '0x3941ae709a872cd14af1871c8442aa4cf0967e84'
  },
  {
    name: 'MagicEden NFT 5',
    address: '0x0fa3da91d4469dfd8c7a0cb13c47d90c8e88d5bd'
  },
  {
    name: 'MagicEden NFT 6',
    address: '0x95d04e083255fe1b71d690791301831b6896d183'
  }
];

// Функція для перевірки RPC-сервера
async function checkRpc(rpcUrl) {
  console.log(`\n🔄 Testing RPC: ${rpcUrl}`.yellow);
  
  try {
    // Створюємо провайдер без проксі
    const provider = new ethers.providers.JsonRpcProvider({
      url: rpcUrl,
      timeout: 30000
    });
    
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
    const testAddress = '0xd1Ae3ea6e2f5eA443427b0C6bfCD1b0daD68289e';
    const balanceStart = Date.now();
    const balance = await provider.getBalance(testAddress);
    const balanceEnd = Date.now();
    const balanceResponseTime = balanceEnd - balanceStart;
    
    console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} MON`.cyan);
    console.log(`⏱️ Balance check response time: ${balanceResponseTime}ms`.cyan);
    
    // Перевіряємо доступність контрактів
    console.log('\nChecking contracts...'.cyan);
    
    for (const contract of CONTRACTS_TO_CHECK) {
      try {
        console.log(`Checking ${contract.name} at ${contract.address}...`.cyan);
        const code = await provider.getCode(contract.address);
        
        if (code !== '0x') {
          console.log(`✅ ${contract.name} contract exists`.green);
        } else {
          console.log(`❌ No contract found for ${contract.name}`.red);
        }
      } catch (error) {
        console.log(`❌ Error checking ${contract.name}: ${error.message}`.red);
      }
    }
    
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
  console.log('🔍 Starting simple RPC check without proxy...'.cyan.bold);
  
  const results = [];
  
  // Перевіряємо кожен RPC-сервер
  for (const rpcUrl of RPC_URLS) {
    const result = await checkRpc(rpcUrl);
    results.push(result);
  }
  
  // Виводимо підсумок
  console.log('\n=== Summary ==='.cyan.bold);
  
  const successfulRpcs = results.filter(r => r.success);
  console.log(`Total RPC servers tested: ${results.length}`.cyan);
  console.log(`Successful connections: ${successfulRpcs.length}`.green);
  console.log(`Failed connections: ${results.length - successfulRpcs.length}`.red);
}

// Запускаємо головну функцію
main().catch(error => {
  console.error(`Error in main function: ${error.message}`.red);
}); 