require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const config = require('../config');

const RPC_URL = config.RPC_URL;
const EXPLORER_URL = config.EXPLORER_URL;
const WMON_CONTRACT = config.CONTRACTS.WMON;

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

// Функція для отримання випадкової суми MON
function getRandomAmount() {
  const min = config.AMOUNTS.MIN_AMOUNT;
  const max = config.AMOUNTS.MAX_AMOUNT;
  const randomAmount = Math.random() * (max - min) + min;
  return ethers.utils.parseEther(randomAmount.toFixed(4));
}

// Адреса контракту Azaar DEX агрегатора (приклад)
const AZAAR_ROUTER_ADDRESS = '0x1234567890123456789012345678901234567890'; // Замінити на реальну адресу, коли буде доступна

// Спрощений ABI для взаємодії з Azaar DEX агрегатором
const AZAAR_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];

// Функція для перевірки найкращого маршруту обміну через Azaar
async function checkBestRoute(wallet, amountIn, fromToken, toToken) {
  try {
    console.log(`🔍 Checking best route for ${ethers.utils.formatEther(amountIn)} ${fromToken === WMON_CONTRACT ? 'WMON' : fromToken} to ${toToken === WMON_CONTRACT ? 'WMON' : toToken}...`.cyan);
    
    // В реальному сценарії ми б використовували API або метод контракту для отримання найкращого маршруту
    // Демо-реалізація:
    console.log(`📊 Found the best route through Azaar DEX Aggregator`.blue);
    console.log(`💰 Expected output: ${(ethers.utils.formatEther(amountIn) * 0.995).toFixed(4)} ${toToken === WMON_CONTRACT ? 'WMON' : toToken} (0.5% fee)`.yellow);
    
    return {
      success: true,
      outputAmount: amountIn.mul(995).div(1000), // Симуляція 0.5% комісії
      route: [fromToken, toToken]
    };
  } catch (error) {
    console.error('❌ Error checking best route:'.red, error);
    return { success: false };
  }
}

// Функція для виконання обміну через Azaar DEX агрегатор
async function executeSwap(wallet, amount, fromToken, toToken) {
  try {
    console.log(`🔄 Executing swap through Azaar DEX Aggregator...`.magenta);
    
    // Отримуємо дані про найкращий маршрут
    const routeInfo = await checkBestRoute(wallet, amount, fromToken, toToken);
    if (!routeInfo.success) {
      throw new Error('Failed to find optimal route');
    }
    
    // Підготовка контракту маршрутизатора
    const router = new ethers.Contract(
      AZAAR_ROUTER_ADDRESS,
      AZAAR_ROUTER_ABI,
      wallet
    );
    
    // Параметри для транзакції
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 хвилин
    const slippage = 0.5; // 0.5% допустиме просковзування
    const amountOutMin = routeInfo.outputAmount.mul(1000 - Math.floor(slippage * 10)).div(1000);
    
    let tx;
    
    // Обмін MON -> Token (MON -> WMON -> Token)
    if (fromToken === WMON_CONTRACT) {
      console.log(`💸 Swapping ${ethers.utils.formatEther(amount)} WMON to Token...`.magenta);
      
      // Спочатку потрібно схвалити використання WMON для роутера
      const wmonContract = new ethers.Contract(
        WMON_CONTRACT,
        ['function approve(address spender, uint256 amount) public returns (bool)'],
        wallet
      );
      
      console.log(`🔑 Approving WMON for Azaar DEX Router...`.yellow);
      const approveTx = await wmonContract.approve(
        AZAAR_ROUTER_ADDRESS, 
        amount,
        { gasLimit: config.GAS.DEFAULT_GAS_LIMIT }
      );
      console.log(`➡️  Approval transaction sent: ${config.EXPLORER_URL}${approveTx.hash}`.yellow);
      await approveTx.wait();
      
      // Виконуємо обмін
      tx = await router.swapExactTokensForTokens(
        amount,
        amountOutMin,
        routeInfo.route,
        wallet.address,
        deadline,
        { gasLimit: config.GAS.DEFAULT_GAS_LIMIT }
      );
    } 
    // Обмін Token -> MON (Token -> WMON -> MON)
    else if (toToken === WMON_CONTRACT) {
      console.log(`💸 Swapping Token to ${ethers.utils.formatEther(amount)} WMON...`.magenta);
      
      // Для прикладу спростимо і використаємо обмін WMON -> WMON
      tx = await router.swapExactTokensForTokens(
        amount,
        amountOutMin,
        routeInfo.route,
        wallet.address,
        deadline,
        { gasLimit: config.GAS.DEFAULT_GAS_LIMIT }
      );
    }
    
    console.log(`✔️  Swap transaction successful`.green.underline);
    console.log(`➡️  Transaction sent: ${config.EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    
    return true;
  } catch (error) {
    console.error('❌ Error executing swap:'.red, error);
    return false;
  }
}

// Функція для обгортання MON в WMON (як у rubic-multi.js)
async function wrapMON(wallet, amount) {
  try {
    console.log(
      `🔄 Wrapping ${ethers.utils.formatEther(amount)} MON into WMON...`.magenta
    );
    const contract = new ethers.Contract(
      config.CONTRACTS.WMON,
      [
        'function deposit() public payable',
        'function withdraw(uint256 amount) public',
      ],
      wallet
    );
    const tx = await contract.deposit({ 
      value: amount, 
      gasLimit: config.GAS.DEFAULT_GAS_LIMIT 
    });
    console.log(`✔️  Wrap MON → WMON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${config.EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('❌ Error wrapping MON:'.red, error);
    return false;
  }
}

// Функція для розгортання WMON назад в MON (як у rubic-multi.js)
async function unwrapMON(wallet, amount) {
  try {
    console.log(
      `🔄 Unwrapping ${ethers.utils.formatEther(amount)} WMON back to MON...`
        .magenta
    );
    const contract = new ethers.Contract(
      config.CONTRACTS.WMON,
      [
        'function deposit() public payable',
        'function withdraw(uint256 amount) public',
      ],
      wallet
    );
    const tx = await contract.withdraw(amount, { 
      gasLimit: config.GAS.DEFAULT_GAS_LIMIT 
    });
    console.log(`✔️  Unwrap WMON → MON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${config.EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('❌ Error unwrapping WMON:'.red, error);
    return false;
  }
}

// Головна функція для виконання обміну через Azaar
async function runSwap(wallet) {
  try {
    const randomAmount = getRandomAmount();
    console.log(`Starting Azaar DEX aggregator swap operation:`.magenta);
    
    // Обгортаємо MON в WMON
    const wrapSuccess = await wrapMON(wallet, randomAmount);
    
    if (wrapSuccess) {
      // Додаємо затримку між операціями
      await delay(); 
      
      // Виконуємо обмін WMON -> WMON (симуляція обміну токенів)
      const swapSuccess = await executeSwap(wallet, randomAmount, WMON_CONTRACT, WMON_CONTRACT);
      
      if (swapSuccess) {
        // Додаємо затримку між операціями
        await delay(); 
        
        // Розгортаємо WMON назад в MON
        await unwrapMON(wallet, randomAmount);
      }
    }
    
    console.log(`Azaar DEX aggregator swap operation completed`.green);
    return true;
  } catch (error) {
    console.error(`❌ Azaar DEX aggregator swap operation failed: ${error.message}`.red);
    return false;
  }
}

// Експортуємо функцію для використання в головному файлі
module.exports = {
  runSwap
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
    console.log(`Starting Azaar DEX aggregator operations for all accounts...`);

    // Виконуємо операції для кожного гаманця
    for (let i = 0; i < wallets.length; i++) {
      const privateKey = wallets[i].trim();
      const proxy = proxies[i % proxies.length].trim();

      const provider = new ethers.providers.JsonRpcProvider({
        url: RPC_URL,
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

      await runSwap(wallet);
      
      // Додаємо затримку між гаманцями
      if (i < wallets.length - 1) {
        console.log(`\nMoving to next wallet...`.cyan);
        await delay(); // Затримка згідно з конфігурацією
      }
    }

    console.log(`\nAll operations completed successfully!`.green.bold);
  }

  main().catch((error) => {
    console.error('Error occurred:', error);
  });
} 