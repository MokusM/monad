const prompts = require('prompts');
const { ethers } = require('ethers');
const fs = require('fs');
const colors = require('colors');
const velocoreModule = require('./scripts/velocore-liquidity');
const symbioticModule = require('./scripts/symbiotic-liquidity');
const nnsModule = require('./scripts/nad-name-service');
const nftMarketplaceModule = require('./scripts/monad-nft-marketplace');
const ambientModule = require('./scripts/ambient-liquidity');

// Константи
const RPC_URL = 'https://testnet-rpc.monad.xyz/';
const MIN_BALANCE = ethers.utils.parseEther('1.0'); // Мінімальний баланс 1 токен

// Функція для створення затримки
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функція для отримання випадкової затримки між min та max секунд
function getRandomDelay(min = 30, max = 60) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000; // конвертуємо в мілісекунди
}

// Функція для виведення інформації про затримку
async function delay(min = 30, max = 60) {
  const delayTime = getRandomDelay(min, max);
  console.log(`⏳ Waiting for ${delayTime / 1000} seconds...`.yellow);
  await sleep(delayTime);
  console.log(`✅ Delay completed`.green);
}

// Читаємо список приватних ключів з файлу wallet.txt
let wallets = [];
try {
  // Читаємо файл як буфер, а не як UTF-8 текст
  const fileContent = fs.readFileSync('wallet.txt', 'ascii');
  wallets = fileContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.length >= 64)
    .map(key => {
      // Видаляємо префікс 0x, якщо він є, і потім додаємо його знову
      const cleanKey = key.startsWith('0x') ? key.substring(2) : key;
      return `0x${cleanKey}`;
    });
  
  console.log(`Loaded ${wallets.length} wallets from file`);
  console.log(`Wallet keys: ${wallets.map(w => w.substring(0, 10) + '...')}`);
} catch (error) {
  console.error(`Error reading wallet file: ${error.message}`.red);
  process.exit(1);
}

// Читаємо список проксі з файлу proxy.txt
let proxies = [];
try {
  const proxyContent = fs.readFileSync('proxy.txt', 'utf8');
  proxies = proxyContent
    .split('\n')
    .filter(Boolean)
    .map(proxy => proxy.trim());
  
  console.log(`Loaded ${proxies.length} proxies from file`);
  console.log(`Proxies: ${proxies}`);
} catch (error) {
  console.error(`Error reading proxy file: ${error.message}`.red);
  process.exit(1);
}

if (wallets.length === 0 || proxies.length === 0) {
  console.error('Please ensure wallet.txt and proxy.txt are not empty.'.red);
  process.exit(1);
}

// Функція для перевірки балансу гаманця
async function checkWalletBalance(privateKey, proxy) {
  try {
    console.log(`Checking balance for wallet with key ${privateKey.substring(0, 10)}... using proxy ${proxy}`);
    
    const provider = new ethers.providers.JsonRpcProvider({
      url: RPC_URL,
      headers: {
        'Proxy-Authorization': `Basic ${Buffer.from(
          proxy.split('@')[0]
        ).toString('base64')}`,
      },
    });

    console.log(`Provider created, creating wallet...`);
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Wallet created with address ${wallet.address}, getting balance...`);
    
    const balance = await wallet.getBalance();
    console.log(`Balance retrieved: ${ethers.utils.formatEther(balance)} MON`);
    
    return {
      wallet,
      provider,
      address: wallet.address,
      balance,
      hasEnoughBalance: balance.gte(MIN_BALANCE)
    };
  } catch (error) {
    console.error(`Error checking wallet balance: ${error.message}`.red);
    console.error(`Error stack: ${error.stack}`.red);
    return {
      address: 'Unknown',
      balance: ethers.BigNumber.from(0),
      hasEnoughBalance: false
    };
  }
}

// Функція для запуску вибраного модуля
async function runSelectedModule(wallet, provider, proxy, moduleName, useDelay = true) {
  console.log(`\nStarting operations for account ${wallet.address} using proxy ${proxy}`.cyan);
  console.log(`Wallet balance: ${ethers.utils.formatEther(await wallet.getBalance())} MON`.green);
  console.log(`Running module: ${moduleName}`.yellow);

  try {
    let result = false;
    
    switch (moduleName) {
      case 'Rubic Swap':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await require('./scripts/rubic-multi').runSwap(wallet);
        break;
      case 'Magma Staking':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await require('./scripts/magma-multi').runStaking(wallet);
        break;
      case 'Izumi Swap':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await require('./scripts/izumi-multi').runSwap(wallet);
        break;
      case 'aPriori Staking':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await require('./scripts/apriori-multi').runStaking(wallet);
        break;
      case 'Liquidity Provision':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await require('./scripts/liquidity-multi').runAddLiquidity(wallet);
        break;
      case 'Ambient Liquidity':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await ambientModule.runAmbientLiquidity(wallet, useDelay);
        break;
      case 'Velocore Liquidity':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await velocoreModule.runVelocoreLiquidity(wallet, useDelay);
        break;
      case 'Symbiotic Liquidity':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await symbioticModule.runSymbioticLiquidity(wallet, useDelay);
        break;
      case 'Nad Name Service (NNS)':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await nnsModule.runDomainRegistration(wallet, useDelay);
        break;
      case 'NFT Marketplace':
        console.log(`\nStarting ${moduleName}...`.magenta);
        result = await nftMarketplaceModule.runNFTMarketplace(wallet, useDelay);
        break;
      default:
        console.error(`Unknown module: ${moduleName}`.red);
        return false;
    }
    
    console.log(`${moduleName} ${result ? 'completed successfully' : 'failed'}`.green);
    
    if (useDelay) {
      await delay(15, 30); // Затримка 15-30 секунд після виконання модуля
    }
    
    return result;
  } catch (error) {
    console.error(`Error running module ${moduleName}: ${error.message}`.red);
    return false;
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

  // Вибір гаманця
  const walletResponse = await prompts({
    type: 'select',
    name: 'walletIndex',
    message: 'Select a wallet to use:',
    choices: validWallets.map((w, i) => ({ 
      title: `${w.address} (${ethers.utils.formatEther(w.balance)} MON)`, 
      value: i 
    }))
  });

  if (walletResponse.walletIndex === undefined) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }

  const selectedWallet = validWallets[walletResponse.walletIndex];

  // Вибір модуля
  const moduleResponse = await prompts({
    type: 'select',
    name: 'module',
    message: 'Select a module to run:',
    choices: [
      { title: 'Rubic Swap', value: 'Rubic Swap' },
      { title: 'Magma Staking', value: 'Magma Staking' },
      { title: 'Izumi Swap', value: 'Izumi Swap' },
      { title: 'aPriori Staking', value: 'aPriori Staking' },
      { title: 'Liquidity Provision', value: 'Liquidity Provision' },
      { title: 'Ambient Liquidity', value: 'Ambient Liquidity' },
      { title: 'Velocore Liquidity', value: 'Velocore Liquidity' },
      { title: 'Symbiotic Liquidity', value: 'Symbiotic Liquidity' },
      { title: 'Nad Name Service (NNS)', value: 'Nad Name Service (NNS)' },
      { title: 'NFT Marketplace', value: 'NFT Marketplace' }
    ]
  });

  if (moduleResponse.module === undefined) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }

  // Запитуємо, чи використовувати затримку
  const delayResponse = await prompts({
    type: 'confirm',
    name: 'useDelay',
    message: 'Use random delay between operations?',
    initial: true
  });

  // Запускаємо вибраний модуль для вибраного гаманця
  await runSelectedModule(
    selectedWallet.wallet, 
    selectedWallet.provider, 
    selectedWallet.proxy, 
    moduleResponse.module,
    delayResponse.useDelay
  );

  console.log(`\nTest completed!`.green.bold);
}

main().catch((error) => {
  console.error('Error occurred:', error);
}); 