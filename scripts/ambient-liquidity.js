require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const prompts = require('prompts');
const utils = require('./utils');

const RPC_URL = 'https://testnet-rpc.monad.xyz/';
const EXPLORER_URL = 'https://testnet.monadexplorer.com/tx/';

// Адреси для Ambient DEX на Monad тестнеті
const WMON_ADDRESS = utils.CONTRACTS.WMON;
const USDC_ADDRESS = utils.CONTRACTS.USDC;
const AMBIENT_ROUTER_ADDRESS = utils.CONTRACTS.AMBIENT_ROUTER;

// Мінімальна сума для додавання ліквідності (0.01 MON)
const MIN_LIQUIDITY_AMOUNT = utils.MIN_AMOUNTS.LIQUIDITY;
const MIN_SWAP_AMOUNT = ethers.utils.parseEther('0.02');

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

// Функція для обгортання MON в WMON
async function wrapMON(wallet, amount) {
  try {
    console.log(`Wrapping ${ethers.utils.formatEther(amount)} MON to WMON...`.cyan);
    
    // ABI для WMON (спрощений)
    const wmonAbi = [
      'function deposit() external payable'
    ];
    
    const wmonContract = new ethers.Contract(WMON_ADDRESS, wmonAbi, wallet);
    
    // Відправляємо транзакцію для обгортання MON
    const tx = await wmonContract.deposit({ value: amount });
    console.log(`Transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`.green);
    
    return true;
  } catch (error) {
    console.error(`Error wrapping MON: ${error.message}`.red);
    return false;
  }
}

// Функція для обміну MON на USDC
async function swapMONtoUSDC(wallet, amountIn) {
  try {
    console.log(`\nStarting swap operation on Ambient DEX...`.magenta);
    console.log(`Will swap ${ethers.utils.formatEther(amountIn)} MON to USDC`.yellow);
    
    // Спочатку обгортаємо MON в WMON
    const wrapResult = await wrapMON(wallet, amountIn);
    if (!wrapResult) {
      console.error(`Failed to wrap MON. Aborting swap operation.`.red);
      return false;
    }
    
    // Затримка між операціями
    await delay(5, 10);
    
    // Схвалюємо WMON для Ambient Router
    const approveResult = await utils.approveToken(wallet, WMON_ADDRESS, amountIn, AMBIENT_ROUTER_ADDRESS);
    if (!approveResult) {
      console.error(`Failed to approve WMON. Aborting swap operation.`.red);
      return false;
    }
    
    // Затримка між операціями
    await delay(5, 10);
    
    // ABI для Ambient Router (спрощений)
    const routerAbi = [
      'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
      'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
    ];
    
    const routerContract = new ethers.Contract(AMBIENT_ROUTER_ADDRESS, routerAbi, wallet);
    
    // Шлях обміну
    const path = [WMON_ADDRESS, USDC_ADDRESS];
    
    // Отримуємо очікувану кількість USDC
    let amountsOut;
    try {
      amountsOut = await routerContract.getAmountsOut(amountIn, path);
      console.log(`Expected USDC amount: ${utils.formatTokenAmount(amountsOut[1], 6)}`.yellow);
    } catch (error) {
      console.error(`Error getting amounts out: ${error.message}`.red);
      // Якщо не вдалося отримати очікувану кількість, встановлюємо мінімальну суму
      amountsOut = [amountIn, ethers.utils.parseUnits('0.1', 6)]; // Мінімум 0.1 USDC
    }
    
    // Мінімальна сума USDC (95% від очікуваної)
    const amountOutMin = amountsOut[1].mul(95).div(100);
    
    // Встановлюємо дедлайн на 20 хвилин
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    
    // Відправляємо транзакцію для обміну
    console.log(`Swapping ${ethers.utils.formatEther(amountIn)} WMON to USDC...`.cyan);
    const tx = await routerContract.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      path,
      wallet.address,
      deadline
    );
    
    console.log(`Swap transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Swap confirmed in block ${receipt.blockNumber}`.green);
    
    // Отримуємо баланс USDC після обміну
    const usdcBalance = await utils.getTokenBalance(wallet, USDC_ADDRESS);
    console.log(`New USDC balance: ${utils.formatTokenAmount(usdcBalance, 6)}`.green);
    
    console.log(`\nSwap operation completed successfully!`.green.bold);
    
    return usdcBalance;
  } catch (error) {
    console.error(`Error in swap operation: ${error.message}`.red);
    return false;
  }
}

// Функція для додавання ліквідності
async function addLiquidity(wallet, tokenA, tokenB, amountA, amountB) {
  try {
    console.log(`\nStarting liquidity provision on Ambient DEX...`.magenta);
    console.log(`Will add ${utils.formatTokenAmount(amountA, tokenA.decimals)} ${tokenA.name} and ${utils.formatTokenAmount(amountB, tokenB.decimals)} ${tokenB.name} as liquidity`.yellow);
    
    // Схвалюємо обидва токени для Ambient Router
    const approveAResult = await utils.approveToken(wallet, tokenA.address, amountA, AMBIENT_ROUTER_ADDRESS);
    if (!approveAResult) {
      console.error(`Failed to approve ${tokenA.name}. Aborting liquidity operation.`.red);
      return false;
    }
    
    // Затримка між операціями
    await delay(5, 10);
    
    const approveBResult = await utils.approveToken(wallet, tokenB.address, amountB, AMBIENT_ROUTER_ADDRESS);
    if (!approveBResult) {
      console.error(`Failed to approve ${tokenB.name}. Aborting liquidity operation.`.red);
      return false;
    }
    
    // Затримка між операціями
    await delay(5, 10);
    
    // ABI для Ambient Router (спрощений)
    const routerAbi = [
      'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)'
    ];
    
    const routerContract = new ethers.Contract(AMBIENT_ROUTER_ADDRESS, routerAbi, wallet);
    
    // Мінімальні суми токенів (95% від бажаних)
    const amountAMin = amountA.mul(95).div(100);
    const amountBMin = amountB.mul(95).div(100);
    
    // Встановлюємо дедлайн на 20 хвилин
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    
    // Відправляємо транзакцію для додавання ліквідності
    console.log(`Adding liquidity...`.cyan);
    const tx = await routerContract.addLiquidity(
      tokenA.address,
      tokenB.address,
      amountA,
      amountB,
      amountAMin,
      amountBMin,
      wallet.address,
      deadline
    );
    
    console.log(`Liquidity transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Liquidity provision confirmed in block ${receipt.blockNumber}`.green);
    
    console.log(`\nLiquidity provision completed successfully!`.green.bold);
    
    return true;
  } catch (error) {
    console.error(`Error in liquidity provision: ${error.message}`.red);
    return false;
  }
}

// Головна функція для додавання ліквідності
async function runAmbientLiquidity(wallet, useDelay = true) {
  try {
    console.log(`\nStarting Ambient Liquidity module...`.magenta);
    
    // Отримуємо баланс гаманця
    const balance = await wallet.getBalance();
    console.log(`Wallet balance: ${ethers.utils.formatEther(balance)} MON`.green);
    
    // Перевіряємо, чи достатньо балансу
    if (balance.lt(MIN_LIQUIDITY_AMOUNT.mul(3))) { // Потрібно в 3 рази більше мінімальної суми
      console.error(`Insufficient balance. You need at least ${ethers.utils.formatEther(MIN_LIQUIDITY_AMOUNT.mul(3))} MON`.red);
      return false;
    }
    
    // Отримуємо випадкову суму для обміну (між 0.03 та 0.05 MON)
    const swapAmount = utils.getRandomAmount(0.03, 0.05);
    console.log(`Will swap ${ethers.utils.formatEther(swapAmount)} MON to USDC`.yellow);
    
    // Затримка перед початком операції
    if (useDelay) {
      await delay(5, 10);
    }
    
    // Обмінюємо MON на USDC
    const usdcBalance = await swapMONtoUSDC(wallet, swapAmount);
    if (!usdcBalance) {
      console.error(`Failed to swap MON to USDC. Aborting liquidity operation.`.red);
      return false;
    }
    
    // Затримка між операціями
    if (useDelay) {
      await delay(5, 10);
    }
    
    // Отримуємо випадкову суму для ліквідності (між 0.01 та 0.02 MON)
    const monLiquidityAmount = utils.getRandomAmount(0.01, 0.02);
    
    // Обгортаємо MON в WMON для ліквідності
    const wrapResult = await wrapMON(wallet, monLiquidityAmount);
    if (!wrapResult) {
      console.error(`Failed to wrap MON for liquidity. Aborting liquidity operation.`.red);
      return false;
    }
    
    // Затримка між операціями
    if (useDelay) {
      await delay(5, 10);
    }
    
    // Використовуємо половину отриманого USDC для ліквідності
    const usdcLiquidityAmount = usdcBalance.div(2);
    
    // Додаємо ліквідність
    const result = await addLiquidity(
      wallet,
      {
        name: 'WMON',
        address: WMON_ADDRESS,
        decimals: 18
      },
      {
        name: 'USDC',
        address: USDC_ADDRESS,
        decimals: 6
      },
      monLiquidityAmount,
      usdcLiquidityAmount
    );
    
    return result;
  } catch (error) {
    console.error(`Error in Ambient Liquidity module: ${error.message}`.red);
    return false;
  }
}

// Інтерактивна функція для додавання ліквідності
async function runInteractiveLiquidity() {
  console.log('Ambient Liquidity Module'.green.bold);
  console.log('========================='.green);
  
  // Запитуємо, чи використовувати файл з гаманцями або ввести приватний ключ вручну
  const sourceResponse = await prompts({
    type: 'select',
    name: 'source',
    message: 'Select wallet source:',
    choices: [
      { title: 'Enter private key manually', value: 'manual' },
      { title: 'Use wallet.txt file', value: 'file' }
    ]
  });
  
  if (!sourceResponse.source) {
    console.log('Operation cancelled. Exiting...'.yellow);
    return;
  }
  
  let walletResults = [];
  
  if (sourceResponse.source === 'manual') {
    // Запитуємо приватний ключ
    const keyResponse = await prompts({
      type: 'password',
      name: 'privateKey',
      message: 'Enter your private key (will be hidden):',
      validate: value => value.length >= 64 ? true : 'Private key must be at least 64 characters'
    });
    
    if (!keyResponse.privateKey) {
      console.log('No private key provided. Exiting...'.yellow);
      return;
    }
    
    // Форматуємо приватний ключ
    const privateKey = keyResponse.privateKey.startsWith('0x') 
      ? keyResponse.privateKey 
      : `0x${keyResponse.privateKey}`;
    
    // Запитуємо, чи використовувати проксі
    const proxyResponse = await prompts({
      type: 'confirm',
      name: 'useProxy',
      message: 'Do you want to use a proxy?',
      initial: false
    });
    
    let proxy = null;
    
    if (proxyResponse.useProxy) {
      const proxyInputResponse = await prompts({
        type: 'text',
        name: 'proxy',
        message: 'Enter proxy (format: username:password@host:port):',
        validate: value => value.includes('@') ? true : 'Invalid proxy format'
      });
      
      if (proxyInputResponse.proxy) {
        proxy = proxyInputResponse.proxy;
      }
    }
    
    console.log('Checking wallet balance...'.yellow);
    const result = await utils.checkWalletBalance(privateKey, proxy);
    walletResults.push({ ...result, privateKey, proxy });
    
    console.log(`Wallet ${result.address}: ${ethers.utils.formatEther(result.balance)} MON - ${result.hasEnoughBalance ? 'SUFFICIENT'.green : 'INSUFFICIENT'.red}`);
  } else {
    // Читаємо список приватних ключів з файлу wallet.txt
    try {
      const wallets = require('fs')
        .readFileSync('wallet.txt', 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line.length >= 64)
        .map(key => key.startsWith('0x') ? key : `0x${key}`);
      
      if (wallets.length === 0) {
        console.error('No valid wallets found in wallet.txt. Exiting...'.red);
        return;
      }
      
      // Запитуємо, чи використовувати проксі
      const proxyResponse = await prompts({
        type: 'confirm',
        name: 'useProxy',
        message: 'Do you want to use proxies from proxy.txt?',
        initial: false
      });
      
      let proxies = [];
      
      if (proxyResponse.useProxy) {
        try {
          proxies = require('fs')
            .readFileSync('proxy.txt', 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(proxy => proxy.trim());
          
          if (proxies.length === 0) {
            console.error('No proxies found in proxy.txt. Continuing without proxies...'.yellow);
          } else {
            console.log(`Loaded ${proxies.length} proxies from proxy.txt`.green);
          }
        } catch (error) {
          console.error(`Error reading proxy.txt: ${error.message}. Continuing without proxies...`.yellow);
        }
      }
      
      console.log('Checking wallet balances...'.yellow);
      
      // Перевіряємо баланси всіх гаманців
      for (let i = 0; i < wallets.length; i++) {
        const privateKey = wallets[i];
        const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
        
        const result = await utils.checkWalletBalance(privateKey, proxy);
        walletResults.push({ ...result, privateKey, proxy });
        
        console.log(`Wallet ${i+1}/${wallets.length}: ${result.address}: ${ethers.utils.formatEther(result.balance)} MON - ${result.hasEnoughBalance ? 'SUFFICIENT'.green : 'INSUFFICIENT'.red}`);
      }
    } catch (error) {
      console.error(`Error reading wallet.txt: ${error.message}`.red);
      return;
    }
  }
  
  // Фільтруємо гаманці з достатнім балансом
  const validWallets = walletResults.filter(w => w.hasEnoughBalance && w.balance.gte(MIN_LIQUIDITY_AMOUNT.mul(3)));
  
  console.log(`\nFound ${validWallets.length} of ${walletResults.length} wallets with sufficient balance for liquidity`.yellow);
  
  if (validWallets.length === 0) {
    console.log(`No wallets with sufficient balance (min ${ethers.utils.formatEther(MIN_LIQUIDITY_AMOUNT.mul(3))} MON). Exiting...`.red);
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
  
  // Запитуємо суми для обміну та ліквідності
  const swapAmountResponse = await prompts({
    type: 'text',
    name: 'amount',
    message: 'Enter amount of MON to swap for USDC:',
    initial: '0.03',
    validate: value => {
      try {
        const amount = ethers.utils.parseEther(value);
        if (amount.lte(0)) {
          return 'Amount must be greater than 0';
        }
        if (amount.gt(selectedWallet.balance)) {
          return `Amount exceeds wallet balance (${ethers.utils.formatEther(selectedWallet.balance)} MON)`;
        }
        return true;
      } catch (error) {
        return 'Invalid amount format';
      }
    }
  });
  
  if (!swapAmountResponse.amount) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  const swapAmount = ethers.utils.parseEther(swapAmountResponse.amount);
  
  const liquidityAmountResponse = await prompts({
    type: 'text',
    name: 'amount',
    message: 'Enter amount of MON to add as liquidity:',
    initial: '0.02',
    validate: value => {
      try {
        const amount = ethers.utils.parseEther(value);
        if (amount.lte(0)) {
          return 'Amount must be greater than 0';
        }
        if (amount.add(swapAmount).gt(selectedWallet.balance)) {
          return `Total amount exceeds wallet balance (${ethers.utils.formatEther(selectedWallet.balance)} MON)`;
        }
        return true;
      } catch (error) {
        return 'Invalid amount format';
      }
    }
  });
  
  if (!liquidityAmountResponse.amount) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  const liquidityAmount = ethers.utils.parseEther(liquidityAmountResponse.amount);
  
  // Запитуємо, чи використовувати затримку
  const delayResponse = await prompts({
    type: 'confirm',
    name: 'useDelay',
    message: 'Use random delay between operations?',
    initial: true
  });
  
  // Запускаємо операцію додавання ліквідності
  console.log(`\nStarting liquidity operation with wallet ${selectedWallet.address}`.cyan);
  
  if (selectedWallet.proxy) {
    console.log(`Using proxy: ${selectedWallet.proxy}`.cyan);
  }
  
  // Обмінюємо MON на USDC
  const usdcBalance = await swapMONtoUSDC(selectedWallet.wallet, swapAmount);
  if (!usdcBalance) {
    console.error(`Failed to swap MON to USDC. Aborting liquidity operation.`.red);
    return;
  }
  
  // Затримка між операціями
  if (delayResponse.useDelay) {
    await delay(5, 10);
  }
  
  // Обгортаємо MON в WMON для ліквідності
  const wrapResult = await wrapMON(selectedWallet.wallet, liquidityAmount);
  if (!wrapResult) {
    console.error(`Failed to wrap MON for liquidity. Aborting liquidity operation.`.red);
    return;
  }
  
  // Затримка між операціями
  if (delayResponse.useDelay) {
    await delay(5, 10);
  }
  
  // Використовуємо половину отриманого USDC для ліквідності
  const usdcLiquidityAmount = usdcBalance.div(2);
  
  // Додаємо ліквідність
  await addLiquidity(
    selectedWallet.wallet,
    {
      name: 'WMON',
      address: WMON_ADDRESS,
      decimals: 18
    },
    {
      name: 'USDC',
      address: USDC_ADDRESS,
      decimals: 6
    },
    liquidityAmount,
    usdcLiquidityAmount
  );
  
  console.log(`\nOperation completed!`.green.bold);
}

// Якщо скрипт запущено напряму, виконуємо інтерактивну функцію
if (require.main === module) {
  runInteractiveLiquidity().catch((error) => {
    console.error('Error occurred:', error);
  });
}

// Експортуємо функції для використання в інших модулях
module.exports = {
  runAmbientLiquidity,
  swapMONtoUSDC,
  addLiquidity,
  WMON_ADDRESS,
  USDC_ADDRESS,
  AMBIENT_ROUTER_ADDRESS
}; 