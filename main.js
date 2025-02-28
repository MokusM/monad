const prompts = require('prompts');
const { ethers } = require('ethers');
const fs = require('fs');
const colors = require('colors');

// Константи
const RPC_URL = 'https://testnet-rpc.monad.xyz/';
const MIN_BALANCE = ethers.utils.parseEther('1.0'); // Мінімальний баланс 1 токен

// Читаємо список приватних ключів з файлу wallet.txt
const wallets = fs
  .readFileSync('wallet.txt', 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(key => key.trim());

// Читаємо список проксі з файлу proxy.txt
const proxies = fs
  .readFileSync('proxy.txt', 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(proxy => proxy.trim());

if (wallets.length === 0 || proxies.length === 0) {
  console.error('Please ensure wallet.txt and proxy.txt are not empty.'.red);
  process.exit(1);
}

// Функція для перевірки балансу гаманця
async function checkWalletBalance(privateKey, proxy) {
  try {
    const provider = new ethers.providers.JsonRpcProvider({
      url: RPC_URL,
      headers: {
        'Proxy-Authorization': `Basic ${Buffer.from(
          proxy.split('@')[0]
        ).toString('base64')}`,
      },
    });

    const wallet = new ethers.Wallet(privateKey, provider);
    const balance = await wallet.getBalance();
    
    return {
      wallet,
      provider,
      address: wallet.address,
      balance,
      hasEnoughBalance: balance.gte(MIN_BALANCE)
    };
  } catch (error) {
    console.error(`Error checking wallet balance: ${error.message}`.red);
    return {
      address: 'Unknown',
      balance: ethers.BigNumber.from(0),
      hasEnoughBalance: false
    };
  }
}

// Функція для запуску модулів у випадковому порядку
async function runModulesInRandomOrder(wallet, provider, proxy) {
  // Масив модулів
  const modules = [
    { name: 'Rubic Swap', run: async () => await require('./scripts/rubic-multi').runSwap(wallet) },
    { name: 'Magma Staking', run: async () => await require('./scripts/magma-multi').runStaking(wallet) },
    { name: 'Izumi Swap', run: async () => await require('./scripts/izumi-multi').runSwap(wallet) },
    { name: 'aPriori Staking', run: async () => await require('./scripts/apriori-multi').runStaking(wallet) }
  ];

  // Перемішуємо масив модулів
  const shuffledModules = [...modules].sort(() => Math.random() - 0.5);

  console.log(`\nStarting operations for account ${wallet.address} using proxy ${proxy}`.cyan);
  console.log(`Wallet balance: ${ethers.utils.formatEther(await wallet.getBalance())} MON`.green);
  console.log(`Running modules in random order: ${shuffledModules.map(m => m.name).join(' -> ')}`.yellow);

  // Запускаємо модулі по черзі
  for (const module of shuffledModules) {
    console.log(`\nStarting ${module.name}...`.magenta);
    await module.run();
    console.log(`${module.name} completed`.green);
  }
}

// Головна функція
async function main() {
  console.log('Starting wallet balance check...'.yellow);

  const walletResults = [];
  
  // Перевіряємо баланси всіх гаманців
  for (let i = 0; i < wallets.length; i++) {
    const privateKey = wallets[i];
    const proxy = proxies[i % proxies.length];
    
    const result = await checkWalletBalance(privateKey, proxy);
    walletResults.push({ ...result, privateKey, proxy });
    
    console.log(`Wallet ${result.address}: ${ethers.utils.formatEther(result.balance)} MON - ${result.hasEnoughBalance ? 'SUFFICIENT'.green : 'INSUFFICIENT'.red}`);
  }

  // Фільтруємо гаманці з достатнім балансом
  const validWallets = walletResults.filter(w => w.hasEnoughBalance);
  
  console.log(`\nFound ${validWallets.length} of ${wallets.length} wallets with sufficient balance`.yellow);
  
  if (validWallets.length === 0) {
    console.log('No wallets with sufficient balance. Exiting...'.red);
    return;
  }

  // Запитуємо користувача, чи продовжувати
  const response = await prompts({
    type: 'confirm',
    name: 'continue',
    message: `Continue with ${validWallets.length} wallets?`,
    initial: true
  });

  if (!response.continue) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }

  // Запускаємо модулі для кожного гаманця з достатнім балансом
  for (const walletData of validWallets) {
    await runModulesInRandomOrder(walletData.wallet, walletData.provider, walletData.proxy);
  }

  console.log(`\nAll operations completed successfully!`.green.bold);
}

main().catch((error) => {
  console.error('Error occurred:', error);
});
