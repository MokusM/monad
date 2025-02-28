const { ethers } = require('ethers');
const colors = require('colors');
const prompts = require('prompts');
const utils = require('./utils');

// Адреси контрактів
const VELOCORE_ROUTER = utils.CONTRACTS.VELOCORE_ROUTER;
const WMON_ADDRESS = utils.CONTRACTS.WMON;
const USDC_ADDRESS = utils.CONTRACTS.USDC;

// Мінімальна сума для свопу
const MIN_SWAP_AMOUNT = utils.MIN_AMOUNTS.SWAP;

// Підтримувані токени для свопу
const SUPPORTED_TOKENS = {
  WMON: {
    name: 'WMON',
    address: WMON_ADDRESS,
    decimals: 18
  },
  USDC: {
    name: 'USDC',
    address: USDC_ADDRESS,
    decimals: 6
  },
  // Додайте інші токени за потреби
};

// Функція для обміну токенів через Velocore DEX
async function swapTokens(wallet, fromToken, toToken, amountIn) {
  try {
    console.log(`\nStarting swap operation on Velocore DEX...`.magenta);
    console.log(`Will swap ${utils.formatTokenAmount(amountIn, fromToken.decimals)} ${fromToken.name} to ${toToken.name}`.yellow);
    
    // Якщо fromToken - це нативний MON, спочатку обгортаємо його в WMON
    if (fromToken.name === 'MON') {
      const wrapResult = await utils.wrapMON(wallet, amountIn);
      if (!wrapResult) {
        console.error(`Failed to wrap MON. Aborting swap operation.`.red);
        return false;
      }
      
      // Оновлюємо fromToken на WMON
      fromToken = SUPPORTED_TOKENS.WMON;
      
      // Затримка між операціями
      await utils.delay(5, 10);
    }
    
    // Схвалюємо токен для Velocore Router
    const approveResult = await utils.approveToken(wallet, fromToken.address, amountIn, VELOCORE_ROUTER);
    if (!approveResult) {
      console.error(`Failed to approve ${fromToken.name}. Aborting swap operation.`.red);
      return false;
    }
    
    // Затримка між операціями
    await utils.delay(5, 10);
    
    // ABI для Velocore Router (спрощений)
    const routerAbi = [
      'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
      'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
    ];
    
    const routerContract = new ethers.Contract(VELOCORE_ROUTER, routerAbi, wallet);
    
    // Шлях обміну
    const path = [fromToken.address, toToken.address];
    
    // Отримуємо очікувану кількість токенів
    let amountsOut;
    try {
      amountsOut = await routerContract.getAmountsOut(amountIn, path);
      console.log(`Expected ${toToken.name} amount: ${utils.formatTokenAmount(amountsOut[1], toToken.decimals)}`.yellow);
    } catch (error) {
      console.error(`Error getting amounts out: ${error.message}`.red);
      // Якщо не вдалося отримати очікувану кількість, встановлюємо мінімальну суму
      amountsOut = [amountIn, ethers.utils.parseUnits('0.1', toToken.decimals)]; // Мінімум 0.1 токена
    }
    
    // Мінімальна сума токенів (95% від очікуваної)
    const amountOutMin = amountsOut[1].mul(95).div(100);
    
    // Встановлюємо дедлайн на 20 хвилин
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    
    // Відправляємо транзакцію для обміну
    console.log(`Swapping ${utils.formatTokenAmount(amountIn, fromToken.decimals)} ${fromToken.name} to ${toToken.name}...`.cyan);
    const tx = await routerContract.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      path,
      wallet.address,
      deadline
    );
    
    console.log(`Swap transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${utils.EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Swap confirmed in block ${receipt.blockNumber}`.green);
    
    // Отримуємо баланс токена після обміну
    const newBalance = await utils.getTokenBalance(wallet, toToken.address);
    console.log(`New ${toToken.name} balance: ${utils.formatTokenAmount(newBalance, toToken.decimals)}`.green);
    
    console.log(`\nSwap operation completed successfully!`.green.bold);
    
    return true;
  } catch (error) {
    console.error(`Error in swap operation: ${error.message}`.red);
    return false;
  }
}

// Головна функція для свопу
async function runSwap(wallet, useDelay = true) {
  try {
    console.log(`\nStarting Velocore Swap module...`.magenta);
    
    // Отримуємо баланс гаманця
    const balance = await wallet.getBalance();
    console.log(`Wallet balance: ${ethers.utils.formatEther(balance)} MON`.green);
    
    // Перевіряємо, чи достатньо балансу
    if (balance.lt(MIN_SWAP_AMOUNT)) {
      console.error(`Insufficient balance. You need at least ${ethers.utils.formatEther(MIN_SWAP_AMOUNT)} MON`.red);
      return false;
    }
    
    // Отримуємо випадкову суму для свопу (між 0.02 та 0.05 MON)
    const swapAmount = utils.getRandomAmount(0.02, 0.05);
    console.log(`Will swap ${ethers.utils.formatEther(swapAmount)} MON`.yellow);
    
    // Створюємо об'єкт для нативного MON
    const monToken = {
      name: 'MON',
      address: ethers.constants.AddressZero,
      decimals: 18
    };
    
    // Вибираємо USDC як цільовий токен
    const toToken = SUPPORTED_TOKENS.USDC;
    
    // Затримка перед початком операції
    if (useDelay) {
      await utils.delay(5, 10);
    }
    
    // Виконуємо операцію свопу
    const result = await swapTokens(wallet, monToken, toToken, swapAmount);
    
    return result;
  } catch (error) {
    console.error(`Error in Velocore Swap module: ${error.message}`.red);
    return false;
  }
}

// Інтерактивна функція для свопу
async function runInteractiveSwap() {
  console.log('Velocore Swap Module'.green.bold);
  console.log('==================='.green);
  
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
  const validWallets = walletResults.filter(w => w.hasEnoughBalance && w.balance.gte(MIN_SWAP_AMOUNT));
  
  console.log(`\nFound ${validWallets.length} of ${walletResults.length} wallets with sufficient balance for swap`.yellow);
  
  if (validWallets.length === 0) {
    console.log(`No wallets with sufficient balance (min ${ethers.utils.formatEther(MIN_SWAP_AMOUNT)} MON). Exiting...`.red);
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
  
  // Вибір токенів для свопу
  const fromTokenResponse = await prompts({
    type: 'select',
    name: 'token',
    message: 'Select token to swap from:',
    choices: [
      { title: 'MON (Native)', value: { name: 'MON', address: ethers.constants.AddressZero, decimals: 18 } },
      ...Object.values(SUPPORTED_TOKENS).map(token => ({ 
        title: token.name, 
        value: token 
      }))
    ]
  });
  
  if (!fromTokenResponse.token) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  const toTokenResponse = await prompts({
    type: 'select',
    name: 'token',
    message: 'Select token to swap to:',
    choices: Object.values(SUPPORTED_TOKENS)
      .filter(token => token.name !== fromTokenResponse.token.name)
      .map(token => ({ 
        title: token.name, 
        value: token 
      }))
  });
  
  if (!toTokenResponse.token) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  // Запитуємо суму для свопу
  const amountResponse = await prompts({
    type: 'text',
    name: 'amount',
    message: `Enter amount of ${fromTokenResponse.token.name} to swap (min ${ethers.utils.formatEther(MIN_SWAP_AMOUNT)}):`,
    initial: '0.02',
    validate: value => {
      try {
        const amount = ethers.utils.parseUnits(value, fromTokenResponse.token.decimals);
        if (amount.lt(MIN_SWAP_AMOUNT)) {
          return `Amount must be at least ${ethers.utils.formatEther(MIN_SWAP_AMOUNT)} ${fromTokenResponse.token.name}`;
        }
        if (fromTokenResponse.token.name === 'MON' && amount.gt(selectedWallet.balance)) {
          return `Amount exceeds wallet balance (${ethers.utils.formatEther(selectedWallet.balance)} MON)`;
        }
        return true;
      } catch (error) {
        return 'Invalid amount format';
      }
    }
  });
  
  if (!amountResponse.amount) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  const swapAmount = ethers.utils.parseUnits(amountResponse.amount, fromTokenResponse.token.decimals);
  
  // Запитуємо, чи використовувати затримку
  const delayResponse = await prompts({
    type: 'confirm',
    name: 'useDelay',
    message: 'Use random delay between operations?',
    initial: true
  });
  
  // Запускаємо операцію свопу
  console.log(`\nStarting swap operation with wallet ${selectedWallet.address}`.cyan);
  
  if (selectedWallet.proxy) {
    console.log(`Using proxy: ${selectedWallet.proxy}`.cyan);
  }
  
  // Виконуємо операцію свопу
  await swapTokens(
    selectedWallet.wallet,
    fromTokenResponse.token,
    toTokenResponse.token,
    swapAmount
  );
  
  console.log(`\nOperation completed!`.green.bold);
}

// Якщо скрипт запущено напряму, виконуємо інтерактивну функцію
if (require.main === module) {
  runInteractiveSwap().catch((error) => {
    console.error('Error occurred:', error);
  });
}

// Експортуємо функції для використання в інших модулях
module.exports = {
  runSwap,
  swapTokens,
  SUPPORTED_TOKENS
}; 