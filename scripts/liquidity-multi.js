require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const axios = require('axios');

const RPC_URL = 'https://testnet-rpc.monad.xyz/';
const EXPLORER_URL = 'https://testnet.monadexplorer.com/tx/';
const WMON_CONTRACT = '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701';
const UNISWAP_ROUTER = '0x5615CDAb10dc425a742d643d949a7F474C01abc4'; // Uniswap Router на Monad тестнеті
const gasLimit = 800000;

// Функція для створення затримки
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функція для отримання випадкової затримки між min та max секунд
function getRandomDelay(min = 60, max = 600) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000; // конвертуємо в мілісекунди
}

// Функція для виведення інформації про затримку
async function delay(min = 60, max = 600) {
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
    console.log(
      `🔄 Wrapping ${ethers.utils.formatEther(amount)} MON into WMON...`.magenta
    );
    const contract = new ethers.Contract(
      WMON_CONTRACT,
      [
        'function deposit() public payable',
        'function withdraw(uint256 amount) public',
      ],
      wallet
    );
    const tx = await contract.deposit({ value: amount, gasLimit: 500000 });
    console.log(`✔️  Wrap MON → WMON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('❌ Error wrapping MON:'.red, error);
    return false;
  }
}

// Функція для перевірки та надання дозволу на використання токенів
async function approveToken(wallet, tokenAddress, spenderAddress, amount) {
  try {
    console.log(`🔄 Approving ${ethers.utils.formatEther(amount)} tokens for DEX...`.magenta);
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        'function approve(address spender, uint256 amount) public returns (bool)',
        'function allowance(address owner, address spender) public view returns (uint256)',
      ],
      wallet
    );

    // Перевіряємо поточний allowance
    const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
    if (currentAllowance.gte(amount)) {
      console.log(`✔️  Token already approved`.green);
      return true;
    }

    const tx = await tokenContract.approve(spenderAddress, amount, { gasLimit });
    console.log(`✔️  Token approval successful`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('❌ Error approving token:'.red, error);
    return false;
  }
}

// Функція для додавання ліквідності в пул WMON/ETH на Uniswap
async function addLiquidityWMONETH(wallet, wmonAmount, ethAmount) {
  try {
    console.log(
      `🔄 Adding liquidity to Uniswap: ${ethers.utils.formatEther(wmonAmount)} WMON and ${ethers.utils.formatEther(ethAmount)} MON...`.magenta
    );

    // Спочатку надаємо дозвіл на використання WMON
    await approveToken(wallet, WMON_CONTRACT, UNISWAP_ROUTER, wmonAmount);
    
    // Додаємо ліквідність
    const uniswapRouter = new ethers.Contract(
      UNISWAP_ROUTER,
      [
        'function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)',
      ],
      wallet
    );

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 хвилин
    const slippage = 50; // 0.5%
    const amountTokenMin = wmonAmount.mul(10000 - slippage).div(10000);
    const amountETHMin = ethAmount.mul(10000 - slippage).div(10000);

    const tx = await uniswapRouter.addLiquidityETH(
      WMON_CONTRACT,
      wmonAmount,
      amountTokenMin,
      amountETHMin,
      wallet.address,
      deadline,
      { value: ethAmount, gasLimit }
    );

    console.log(`✔️  Liquidity added successfully`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('❌ Error adding liquidity:'.red, error);
    return false;
  }
}

// Функція для виконання операції додавання ліквідності
async function runLiquidityProvision(wallet) {
  try {
    console.log(`Starting liquidity provision operation:`.magenta);
    
    // Отримуємо випадкову суму MON для обгортання в WMON
    const wmonAmount = getRandomAmount();
    
    // Отримуємо випадкову суму MON для додавання як ETH
    const ethAmount = getRandomAmount();
    
    // Перевіряємо, чи достатньо MON на балансі
    const balance = await wallet.getBalance();
    const requiredBalance = wmonAmount.add(ethAmount).add(ethers.utils.parseEther('0.01')); // Додаємо 0.01 MON для газу
    
    if (balance.lt(requiredBalance)) {
      console.log(`❌ Insufficient MON balance. Required: ${ethers.utils.formatEther(requiredBalance)} MON, Available: ${ethers.utils.formatEther(balance)} MON`.red);
      return false;
    }
    
    // Обгортаємо MON в WMON
    await wrapMON(wallet, wmonAmount);
    
    // Додаємо ліквідність WMON/ETH
    await addLiquidityWMONETH(wallet, wmonAmount, ethAmount);
    
    console.log(`Liquidity provision operation completed`.green);
    return true;
  } catch (error) {
    console.error(`❌ Liquidity provision operation failed: ${error.message}`.red);
    return false;
  }
}

// Експортуємо функцію для використання в головному файлі
module.exports = {
  runLiquidityProvision
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

      await runLiquidityProvision(wallet);
      
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