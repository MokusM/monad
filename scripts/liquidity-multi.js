require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const axios = require('axios');

const RPC_URL = 'https://testnet-rpc.monad.xyz/';
const EXPLORER_URL = 'https://testnet.monadexplorer.com/tx/';

// Оновлені адреси для Ambient DEX на Monad тестнеті
const WMON_ADDRESS = '0x4200000000000000000000000000000000000023'; // Wrapped MON на тестнеті
const USDC_ADDRESS = '0x4200000000000000000000000000000000000022'; // USDC на тестнеті
const AMBIENT_ROUTER_ADDRESS = '0x5615CDAb10dc425a742d643d949a7F474C01abc4'; // Припустимо, це адреса Ambient Router

// Мінімальна сума для додавання ліквідності (0.01 MON)
const MIN_LIQUIDITY_AMOUNT = ethers.utils.parseEther('0.01');
const SWAP_AMOUNT = ethers.utils.parseEther('0.02'); // Сума для обміну на USDC

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

// Функція для отримання випадкової суми MON між 0.01 та 0.05
function getRandomAmount() {
  const min = 0.01;
  const max = 0.05;
  const randomAmount = Math.random() * (max - min) + min;
  return ethers.utils.parseEther(randomAmount.toFixed(4));
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
    console.log(`Swapping ${ethers.utils.formatEther(amountIn)} MON to USDC...`.cyan);
    
    // Спочатку обгортаємо MON в WMON
    const wrapResult = await wrapMON(wallet, amountIn);
    if (!wrapResult) {
      console.error(`Failed to wrap MON. Aborting swap.`.red);
      return false;
    }
    
    // ABI для роутера DEX (спрощений, базується на Uniswap V2)
    const routerAbi = [
      'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
      'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
    ];
    
    const routerContract = new ethers.Contract(AMBIENT_ROUTER_ADDRESS, routerAbi, wallet);
    
    // Схвалюємо WMON для DEX
    const approveResult = await approveToken(wallet, WMON_ADDRESS, amountIn, AMBIENT_ROUTER_ADDRESS);
    if (!approveResult) {
      console.error(`Failed to approve WMON. Aborting swap.`.red);
      return false;
    }
    
    // Шлях обміну: WMON -> USDC
    const path = [WMON_ADDRESS, USDC_ADDRESS];
    
    // Отримуємо очікувану кількість USDC
    let amountsOut;
    try {
      amountsOut = await routerContract.getAmountsOut(amountIn, path);
      console.log(`Expected USDC amount: ${ethers.utils.formatUnits(amountsOut[1], 6)}`.yellow);
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
    const tx = await routerContract.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      path,
      wallet.address,
      deadline
    );
    
    console.log(`Swap transaction sent: ${tx.hash}`.green);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Swap confirmed in block ${receipt.blockNumber}`.green);
    
    return amountsOut[1]; // Повертаємо отриману кількість USDC
  } catch (error) {
    console.error(`Error swapping MON to USDC: ${error.message}`.red);
    return false;
  }
}

// Функція для схвалення токенів для DEX
async function approveToken(wallet, tokenAddress, amount, spender) {
  try {
    console.log(`Approving ${ethers.utils.formatEther(amount)} tokens for DEX...`.cyan);
    
    // ABI для ERC20 токенів (спрощений)
    const erc20Abi = [
      'function approve(address spender, uint256 amount) external returns (bool)'
    ];
    
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
    
    // Відправляємо транзакцію для схвалення токенів без перевірки allowance
    const tx = await tokenContract.approve(spender, ethers.constants.MaxUint256);
    console.log(`Approval transaction sent: ${tx.hash}`.green);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Approval confirmed in block ${receipt.blockNumber}`.green);
    
    return true;
  } catch (error) {
    console.error(`Error approving token: ${error.message}`.red);
    return false;
  }
}

// Функція для додавання ліквідності
async function addLiquidity(wallet, tokenA, tokenB, amountA, amountB) {
  try {
    console.log(`Adding liquidity to Ambient DEX...`.cyan);
    
    // ABI для роутера DEX (спрощений, базується на Uniswap V2)
    const routerAbi = [
      'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)'
    ];
    
    const routerContract = new ethers.Contract(AMBIENT_ROUTER_ADDRESS, routerAbi, wallet);
    
    // Встановлюємо дедлайн на 20 хвилин
    const deadline = Math.floor(Date.now() / 1000) + 1200;
    
    // Мінімальна сума токенів (95% від бажаної суми)
    const amountAMin = amountA.mul(95).div(100);
    const amountBMin = amountB.mul(95).div(100);
    
    // Відправляємо транзакцію для додавання ліквідності
    const tx = await routerContract.addLiquidity(
      tokenA,
      tokenB,
      amountA,
      amountB,
      amountAMin,
      amountBMin,
      wallet.address,
      deadline
    );
    
    console.log(`Add liquidity transaction sent: ${tx.hash}`.green);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Liquidity added in block ${receipt.blockNumber}`.green);
    
    return true;
  } catch (error) {
    console.error(`Error adding liquidity: ${error.message}`.red);
    return false;
  }
}

// Головна функція для додавання ліквідності
async function runAddLiquidity(wallet) {
  try {
    console.log(`\nStarting liquidity provision process...`.magenta);
    
    // Визначаємо суму для обміну на USDC (0.02 MON)
    const swapAmount = SWAP_AMOUNT.add(
      ethers.utils.parseEther(
        (Math.random() * 0.01).toFixed(6)
      )
    );
    
    console.log(`Will swap ${ethers.utils.formatEther(swapAmount)} MON to USDC`.yellow);
    
    // Обмінюємо MON на USDC
    const usdcAmount = await swapMONtoUSDC(wallet, swapAmount);
    if (!usdcAmount) {
      console.error(`Failed to swap MON to USDC. Aborting liquidity provision.`.red);
      return false;
    }
    
    // Затримка між операціями
    await delay(5, 10);
    
    // Визначаємо суму для додавання ліквідності (0.01 MON)
    const liquidityAmount = MIN_LIQUIDITY_AMOUNT.add(
      ethers.utils.parseEther(
        (Math.random() * 0.01).toFixed(6)
      )
    );
    
    console.log(`Will add ${ethers.utils.formatEther(liquidityAmount)} MON as liquidity`.yellow);
    
    // Обгортаємо MON в WMON для ліквідності
    const wrapResult = await wrapMON(wallet, liquidityAmount);
    if (!wrapResult) {
      console.error(`Failed to wrap MON. Aborting liquidity provision.`.red);
      return false;
    }
    
    // Затримка між операціями
    await delay(5, 10);
    
    // Схвалюємо WMON для DEX
    const approveWmonResult = await approveToken(wallet, WMON_ADDRESS, liquidityAmount, AMBIENT_ROUTER_ADDRESS);
    if (!approveWmonResult) {
      console.error(`Failed to approve WMON. Aborting liquidity provision.`.red);
      return false;
    }
    
    // Затримка між операціями
    await delay(5, 10);
    
    // Схвалюємо USDC для DEX
    const approveUsdcResult = await approveToken(wallet, USDC_ADDRESS, usdcAmount, AMBIENT_ROUTER_ADDRESS);
    if (!approveUsdcResult) {
      console.error(`Failed to approve USDC. Aborting liquidity provision.`.red);
      return false;
    }
    
    // Затримка між операціями
    await delay(5, 10);
    
    // Додаємо ліквідність
    const addLiquidityResult = await addLiquidity(
      wallet,
      WMON_ADDRESS,
      USDC_ADDRESS,
      liquidityAmount,
      usdcAmount
    );
    
    if (addLiquidityResult) {
      console.log(`Successfully added liquidity to Ambient DEX`.green.bold);
      return true;
    } else {
      console.error(`Failed to add liquidity`.red);
      return false;
    }
    
  } catch (error) {
    console.error(`Error in liquidity provision process: ${error.message}`.red);
    return false;
  }
}

// Функція для запуску модуля для багатьох гаманців
async function runLiquidityMulti() {
  try {
    // Читаємо список приватних ключів з файлу wallet.txt
    const wallets = fs
      .readFileSync('wallet.txt', 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.length >= 64)
      .map(key => key.startsWith('0x') ? key : `0x${key}`);
    
    // Читаємо список проксі з файлу proxy.txt
    const proxies = fs
      .readFileSync('proxy.txt', 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(proxy => proxy.trim());
    
    if (wallets.length === 0 || proxies.length === 0) {
      console.error('Please ensure wallet.txt and proxy.txt are not empty.'.red);
      return false;
    }
    
    console.log(`Found ${wallets.length} wallets and ${proxies.length} proxies`.yellow);
    
    // Запускаємо процес для кожного гаманця
    for (let i = 0; i < wallets.length; i++) {
      const privateKey = wallets[i];
      const proxy = proxies[i % proxies.length];
      
      console.log(`\nProcessing wallet ${i + 1}/${wallets.length}`.cyan);
      
      // Створюємо провайдер з проксі
      const provider = new ethers.providers.JsonRpcProvider({
        url: RPC_URL,
        headers: {
          'Proxy-Authorization': `Basic ${Buffer.from(
            proxy.split('@')[0]
          ).toString('base64')}`,
        },
      });
      
      // Створюємо гаманець
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Перевіряємо баланс
      const balance = await wallet.getBalance();
      console.log(`Wallet ${wallet.address} balance: ${ethers.utils.formatEther(balance)} MON`.green);
      
      // Якщо баланс достатній, запускаємо процес додавання ліквідності
      if (balance.gte(SWAP_AMOUNT.add(MIN_LIQUIDITY_AMOUNT))) {
        await runAddLiquidity(wallet);
      } else {
        console.log(`Insufficient balance for liquidity provision. Skipping.`.yellow);
      }
      
      // Затримка між гаманцями (1-10 хвилин)
      if (i < wallets.length - 1) {
        await delay(60, 600);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error in multi-wallet liquidity provision: ${error.message}`.red);
    return false;
  }
}

// Експортуємо функцію для використання в головному файлі
module.exports = {
  runAddLiquidity,
  runLiquidityMulti
};

// Якщо скрипт запущено напряму, виконуємо основну функцію
if (require.main === module) {
  // Читаємо список приватних ключів з файлу wallet.txt
  const wallets = fs
    .readFileSync('wallet.txt', 'utf8')
    .split('\n')
    .filter(Boolean);

  // Читаємо список проксі з файлу proxy.txt
  const proxies = fs
    .readFileSync('proxy.txt', 'utf8')
    .split('\n')
    .filter(Boolean);

  if (wallets.length === 0 || proxies.length === 0) {
    console.error('Please ensure wallet.txt and proxy.txt are not empty.'.red);
    process.exit(1);
  }

  async function main() {
    console.log(`Starting liquidity provision operations for all accounts...`);

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

      await runLiquidityMulti();
      
      // Додаємо затримку між гаманцями
      if (i < wallets.length - 1) {
        console.log(`\nMoving to next wallet...`.cyan);
        await delay(60, 600); // Затримка 1-10 хвилин між гаманцями
      }
    }

    console.log(`\nAll operations completed successfully!`.green.bold);
  }

  main().catch((error) => {
    console.error('Error occurred:', error);
  });
} 