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
const MIN_BALANCE = ethers.utils.parseEther('0.01'); // Знижуємо мінімальний баланс для тестування

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

// Жорстко закодовані приватні ключі для тестування
const hardcodedWallets = [
  "0x4e682a82c677ce2f3c7b547bf60e4aae8c3596bdfe230923d567959de52fa4e1",
  "0xea2fb5f12f159066fe156837fca53380175c095c31ca33b2d9b1ea156a68ec89"
];

console.log(`Using ${hardcodedWallets.length} hardcoded wallets for testing`);

// Читаємо список проксі з файлу proxy.txt
let proxies = [];
try {
  const proxyContent = fs.readFileSync('proxy.txt', 'utf8');
  proxies = proxyContent
    .split('\n')
    .filter(Boolean)
    .map(proxy => proxy.trim());
} catch (error) {
  // Якщо файл не знайдено, використовуємо тестовий проксі
  proxies = ["http://541271985d048090:RNW78Fm5@res.proxy-seller.com:10029"];
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
  for (let i = 0; i < hardcodedWallets.length; i++) {
    const privateKey = hardcodedWallets[i];
    const proxy = proxies[i % proxies.length];
    
    const result = await checkWalletBalance(privateKey, proxy);
    walletResults.push({ ...result, privateKey, proxy });
    
    console.log(`Wallet ${result.address}: ${ethers.utils.formatEther(result.balance)} MON - ${result.hasEnoughBalance ? 'SUFFICIENT'.green : 'INSUFFICIENT'.red}`);
  }

  // Фільтруємо гаманці з достатнім балансом
  const validWallets = walletResults.filter(w => w.hasEnoughBalance);
  
  console.log(`\nFound ${validWallets.length} of ${hardcodedWallets.length} wallets with sufficient balance`.yellow);
  
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