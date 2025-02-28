require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');

const RPC_URL = 'https://testnet-rpc.monad.xyz/';
const EXPLORER_URL = 'https://testnet.monadexplorer.com/tx/';
const WMON_CONTRACT = '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701';
const MAGMA_CONTRACT = '0x2c9C959516e9AAEdB2C748224a41249202ca8BE7';

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

// Функція для стейкінгу WMON в Magma
async function stakeWMON(wallet, amount) {
  try {
    console.log(
      `🔄 Staking ${ethers.utils.formatEther(amount)} WMON in Magma...`.magenta
    );
    
    // Використовуємо прямий виклик транзакції, як у magma-thread.js
    const tx = {
      to: MAGMA_CONTRACT,
      data: '0xd5575982', // хеш функції stake()
      gasLimit: 500000,
      value: amount,
    };
    
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`✔️  Stake WMON in Magma successful`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${txResponse.hash}`.yellow);
    await txResponse.wait();
    return true;
  } catch (error) {
    console.error('❌ Error staking WMON:'.red, error);
    return false;
  }
}

// Функція для виконання одноразової операції стейкінгу
async function runStaking(wallet) {
  try {
    const randomAmount = getRandomAmount();
    console.log(`Starting Magma staking operation:`.magenta);
    
    // Обгортаємо MON в WMON
    const wrapSuccess = await wrapMON(wallet, randomAmount);
    
    // Додаємо затримку між операціями
    if (wrapSuccess) {
      await delay(60, 600); // Затримка 1-10 хвилин між операціями
      await stakeWMON(wallet, randomAmount);
    }
    
    console.log(`Magma staking operation completed`.green);
    return true;
  } catch (error) {
    console.error(`❌ Magma staking operation failed: ${error.message}`.red);
    return false;
  }
}

// Експортуємо функцію для використання в головному файлі
module.exports = {
  runStaking
};

// Якщо скрипт запущено напряму, виконуємо основну функцію
if (require.main === module) {
  async function main() {
    console.log(`Starting staking operations for all accounts...`);
    
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

      await runStaking(wallet);
      
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
