const { ethers } = require('ethers');
const colors = require('colors');
const prompts = require('prompts');
const utils = require('./utils');

// Адреси контрактів
const NFT_MARKETPLACE = utils.CONTRACTS.NFT_MARKETPLACE;
const WMON_ADDRESS = utils.CONTRACTS.WMON;

// Мінімальна сума для операцій з NFT
const MIN_NFT_AMOUNT = ethers.utils.parseEther('0.05');

// Функція для отримання списку доступних NFT на маркетплейсі
async function getAvailableNFTs(wallet) {
  try {
    console.log(`Getting available NFTs on marketplace...`.cyan);
    
    // ABI для NFT Marketplace (спрощений)
    const marketplaceAbi = [
      'function getListedNFTs() external view returns (tuple(address nftContract, uint256 tokenId, address seller, uint256 price, bool sold)[] memory)'
    ];
    
    const marketplaceContract = new ethers.Contract(NFT_MARKETPLACE, marketplaceAbi, wallet);
    
    // Отримуємо список доступних NFT
    const listedNFTs = await marketplaceContract.getListedNFTs();
    
    console.log(`Found ${listedNFTs.length} NFTs on marketplace`.yellow);
    
    // Виводимо інформацію про кожен NFT
    for (let i = 0; i < listedNFTs.length; i++) {
      const nft = listedNFTs[i];
      if (!nft.sold) {
        console.log(`NFT #${i+1}: Contract ${nft.nftContract}, Token ID ${nft.tokenId.toString()}, Price ${ethers.utils.formatEther(nft.price)} MON`.green);
      }
    }
    
    return listedNFTs.filter(nft => !nft.sold);
  } catch (error) {
    console.error(`Error getting available NFTs: ${error.message}`.red);
    return [];
  }
}

// Функція для купівлі NFT
async function buyNFT(wallet, nftContract, tokenId, price) {
  try {
    console.log(`\nStarting NFT purchase process...`.magenta);
    console.log(`Buying NFT: Contract ${nftContract}, Token ID ${tokenId}, Price ${ethers.utils.formatEther(price)} MON`.yellow);
    
    // Перевіряємо, чи достатньо балансу
    const balance = await wallet.getBalance();
    if (balance.lt(price)) {
      console.error(`Insufficient balance. You need ${ethers.utils.formatEther(price)} MON but have only ${ethers.utils.formatEther(balance)} MON`.red);
      return false;
    }
    
    // ABI для NFT Marketplace (спрощений)
    const marketplaceAbi = [
      'function buyNFT(address nftContract, uint256 tokenId) external payable'
    ];
    
    const marketplaceContract = new ethers.Contract(NFT_MARKETPLACE, marketplaceAbi, wallet);
    
    // Відправляємо транзакцію для купівлі NFT
    console.log(`Sending transaction to buy NFT...`.cyan);
    const tx = await marketplaceContract.buyNFT(nftContract, tokenId, { value: price });
    
    console.log(`Purchase transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${utils.EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Purchase confirmed in block ${receipt.blockNumber}`.green);
    
    console.log(`\nNFT successfully purchased!`.green.bold);
    
    return true;
  } catch (error) {
    console.error(`Error buying NFT: ${error.message}`.red);
    return false;
  }
}

// Функція для створення нового NFT
async function mintNFT(wallet, name, description, imageUrl) {
  try {
    console.log(`\nStarting NFT minting process...`.magenta);
    console.log(`Minting NFT: Name "${name}", Description "${description}", Image URL "${imageUrl}"`.yellow);
    
    // ABI для NFT Contract (спрощений)
    const nftAbi = [
      'function mint(string memory name, string memory description, string memory imageUrl) external returns (uint256)'
    ];
    
    // Припускаємо, що адреса NFT контракту доступна через маркетплейс
    const marketplaceAbi = [
      'function getNFTContract() external view returns (address)'
    ];
    
    const marketplaceContract = new ethers.Contract(NFT_MARKETPLACE, marketplaceAbi, wallet);
    const nftContractAddress = await marketplaceContract.getNFTContract();
    
    console.log(`Using NFT contract at ${nftContractAddress}`.yellow);
    
    const nftContract = new ethers.Contract(nftContractAddress, nftAbi, wallet);
    
    // Відправляємо транзакцію для створення NFT
    console.log(`Sending transaction to mint NFT...`.cyan);
    const tx = await nftContract.mint(name, description, imageUrl);
    
    console.log(`Mint transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${utils.EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Mint confirmed in block ${receipt.blockNumber}`.green);
    
    // Отримуємо ID нового токена з подій
    let tokenId = null;
    if (receipt.logs && receipt.logs.length > 0) {
      // Припускаємо, що перша подія містить ID токена
      const log = receipt.logs[0];
      const iface = new ethers.utils.Interface(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']);
      const parsedLog = iface.parseLog(log);
      tokenId = parsedLog.args.tokenId;
      console.log(`New NFT minted with Token ID: ${tokenId}`.green);
    }
    
    console.log(`\nNFT successfully minted!`.green.bold);
    
    return { success: true, tokenId, nftContract: nftContractAddress };
  } catch (error) {
    console.error(`Error minting NFT: ${error.message}`.red);
    return { success: false };
  }
}

// Функція для виставлення NFT на продаж
async function listNFTForSale(wallet, nftContract, tokenId, price) {
  try {
    console.log(`\nStarting NFT listing process...`.magenta);
    console.log(`Listing NFT: Contract ${nftContract}, Token ID ${tokenId}, Price ${ethers.utils.formatEther(price)} MON`.yellow);
    
    // Спочатку схвалюємо маркетплейс для передачі NFT
    const nftAbi = [
      'function approve(address to, uint256 tokenId) external'
    ];
    
    const nftContractInstance = new ethers.Contract(nftContract, nftAbi, wallet);
    
    console.log(`Approving marketplace to transfer NFT...`.cyan);
    const approveTx = await nftContractInstance.approve(NFT_MARKETPLACE, tokenId);
    
    console.log(`Approval transaction sent: ${approveTx.hash}`.green);
    console.log(`View on explorer: ${utils.EXPLORER_URL}${approveTx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const approveReceipt = await approveTx.wait();
    console.log(`Approval confirmed in block ${approveReceipt.blockNumber}`.green);
    
    // Затримка між операціями
    await utils.delay(5, 10);
    
    // ABI для NFT Marketplace (спрощений)
    const marketplaceAbi = [
      'function listNFT(address nftContract, uint256 tokenId, uint256 price) external'
    ];
    
    const marketplaceContract = new ethers.Contract(NFT_MARKETPLACE, marketplaceAbi, wallet);
    
    // Відправляємо транзакцію для виставлення NFT на продаж
    console.log(`Sending transaction to list NFT for sale...`.cyan);
    const tx = await marketplaceContract.listNFT(nftContract, tokenId, price);
    
    console.log(`Listing transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${utils.EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Listing confirmed in block ${receipt.blockNumber}`.green);
    
    console.log(`\nNFT successfully listed for sale!`.green.bold);
    
    return true;
  } catch (error) {
    console.error(`Error listing NFT for sale: ${error.message}`.red);
    return false;
  }
}

// Головна функція для взаємодії з NFT маркетплейсом
async function runNFTMarketplace(wallet, useDelay = true) {
  try {
    console.log(`\nStarting Monad NFT Marketplace module...`.magenta);
    
    // Отримуємо баланс гаманця
    const balance = await wallet.getBalance();
    console.log(`Wallet balance: ${ethers.utils.formatEther(balance)} MON`.green);
    
    // Перевіряємо, чи достатньо балансу
    if (balance.lt(MIN_NFT_AMOUNT)) {
      console.error(`Insufficient balance. You need at least ${ethers.utils.formatEther(MIN_NFT_AMOUNT)} MON`.red);
      return false;
    }
    
    // Генеруємо випадкові дані для NFT
    const randomId = Math.floor(Math.random() * 10000);
    const nftName = `Monad NFT #${randomId}`;
    const nftDescription = `A beautiful NFT on Monad blockchain #${randomId}`;
    const nftImageUrl = `https://picsum.photos/id/${randomId}/500/500`;
    
    console.log(`Generated random NFT data:`.yellow);
    console.log(`Name: ${nftName}`.yellow);
    console.log(`Description: ${nftDescription}`.yellow);
    console.log(`Image URL: ${nftImageUrl}`.yellow);
    
    // Затримка перед початком операції
    if (useDelay) {
      await utils.delay(5, 10);
    }
    
    // Створюємо новий NFT
    const mintResult = await mintNFT(wallet, nftName, nftDescription, nftImageUrl);
    
    if (mintResult.success && mintResult.tokenId) {
      // Затримка між операціями
      if (useDelay) {
        await utils.delay(5, 10);
      }
      
      // Генеруємо випадкову ціну для NFT (між 0.05 та 0.2 MON)
      const price = utils.getRandomAmount(0.05, 0.2);
      
      // Виставляємо NFT на продаж
      await listNFTForSale(wallet, mintResult.nftContract, mintResult.tokenId, price);
    }
    
    return mintResult.success;
  } catch (error) {
    console.error(`Error in NFT Marketplace module: ${error.message}`.red);
    return false;
  }
}

// Інтерактивна функція для взаємодії з NFT маркетплейсом
async function runInteractiveNFTMarketplace() {
  console.log('Monad NFT Marketplace Module'.green.bold);
  console.log('=========================='.green);
  
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
  const validWallets = walletResults.filter(w => w.hasEnoughBalance && w.balance.gte(MIN_NFT_AMOUNT));
  
  console.log(`\nFound ${validWallets.length} of ${walletResults.length} wallets with sufficient balance for NFT operations`.yellow);
  
  if (validWallets.length === 0) {
    console.log(`No wallets with sufficient balance (min ${ethers.utils.formatEther(MIN_NFT_AMOUNT)} MON). Exiting...`.red);
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
  
  // Вибір операції
  const operationResponse = await prompts({
    type: 'select',
    name: 'operation',
    message: 'Select operation:',
    choices: [
      { title: 'Mint new NFT', value: 'mint' },
      { title: 'Browse available NFTs', value: 'browse' },
      { title: 'Buy NFT', value: 'buy' }
    ]
  });
  
  if (!operationResponse.operation) {
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
  
  // Запускаємо вибрану операцію
  console.log(`\nStarting NFT operation with wallet ${selectedWallet.address}`.cyan);
  
  if (selectedWallet.proxy) {
    console.log(`Using proxy: ${selectedWallet.proxy}`.cyan);
  }
  
  switch (operationResponse.operation) {
    case 'mint':
      // Запитуємо дані для NFT
      const nftDataResponse = await prompts([
        {
          type: 'text',
          name: 'name',
          message: 'Enter NFT name:',
          initial: `Monad NFT #${Math.floor(Math.random() * 10000)}`,
          validate: value => value.length > 0 ? true : 'Name cannot be empty'
        },
        {
          type: 'text',
          name: 'description',
          message: 'Enter NFT description:',
          initial: 'A beautiful NFT on Monad blockchain',
          validate: value => value.length > 0 ? true : 'Description cannot be empty'
        },
        {
          type: 'text',
          name: 'imageUrl',
          message: 'Enter NFT image URL:',
          initial: `https://picsum.photos/id/${Math.floor(Math.random() * 1000)}/500/500`,
          validate: value => value.startsWith('http') ? true : 'URL must start with http'
        }
      ]);
      
      if (!nftDataResponse.name || !nftDataResponse.description || !nftDataResponse.imageUrl) {
        console.log('Operation cancelled by user. Exiting...'.yellow);
        return;
      }
      
      // Створюємо новий NFT
      const mintResult = await mintNFT(
        selectedWallet.wallet,
        nftDataResponse.name,
        nftDataResponse.description,
        nftDataResponse.imageUrl
      );
      
      if (mintResult.success && mintResult.tokenId) {
        // Запитуємо, чи виставити NFT на продаж
        const listResponse = await prompts({
          type: 'confirm',
          name: 'listForSale',
          message: 'Do you want to list this NFT for sale?',
          initial: true
        });
        
        if (listResponse.listForSale) {
          // Затримка між операціями
          if (delayResponse.useDelay) {
            await utils.delay(5, 10);
          }
          
          // Запитуємо ціну для NFT
          const priceResponse = await prompts({
            type: 'text',
            name: 'price',
            message: 'Enter price in MON:',
            initial: '0.1',
            validate: value => {
              try {
                const price = ethers.utils.parseEther(value);
                return price.gt(0) ? true : 'Price must be greater than 0';
              } catch (error) {
                return 'Invalid price format';
              }
            }
          });
          
          if (priceResponse.price) {
            // Виставляємо NFT на продаж
            await listNFTForSale(
              selectedWallet.wallet,
              mintResult.nftContract,
              mintResult.tokenId,
              ethers.utils.parseEther(priceResponse.price)
            );
          }
        }
      }
      break;
      
    case 'browse':
      // Отримуємо список доступних NFT
      const availableNFTs = await getAvailableNFTs(selectedWallet.wallet);
      
      if (availableNFTs.length === 0) {
        console.log('No NFTs available for purchase.'.yellow);
        return;
      }
      
      // Запитуємо, чи купити NFT
      const buyResponse = await prompts({
        type: 'confirm',
        name: 'buyNFT',
        message: 'Do you want to buy an NFT?',
        initial: true
      });
      
      if (buyResponse.buyNFT) {
        // Переходимо до купівлі NFT
        operationResponse.operation = 'buy';
      } else {
        console.log('Operation completed!'.green.bold);
        return;
      }
      // Продовжуємо до case 'buy'
      
    case 'buy':
      // Отримуємо список доступних NFT, якщо ще не отримали
      const nftsForSale = operationResponse.operation === 'browse' 
        ? availableNFTs 
        : await getAvailableNFTs(selectedWallet.wallet);
      
      if (nftsForSale.length === 0) {
        console.log('No NFTs available for purchase.'.yellow);
        return;
      }
      
      // Вибір NFT для купівлі
      const nftResponse = await prompts({
        type: 'select',
        name: 'nftIndex',
        message: 'Select NFT to buy:',
        choices: nftsForSale.map((nft, i) => ({ 
          title: `NFT #${i+1}: Contract ${nft.nftContract}, Token ID ${nft.tokenId.toString()}, Price ${ethers.utils.formatEther(nft.price)} MON`, 
          value: i 
        }))
      });
      
      if (nftResponse.nftIndex === undefined) {
        console.log('Operation cancelled by user. Exiting...'.yellow);
        return;
      }
      
      const selectedNFT = nftsForSale[nftResponse.nftIndex];
      
      // Купуємо вибраний NFT
      await buyNFT(
        selectedWallet.wallet,
        selectedNFT.nftContract,
        selectedNFT.tokenId,
        selectedNFT.price
      );
      break;
  }
  
  console.log(`\nOperation completed!`.green.bold);
}

// Якщо скрипт запущено напряму, виконуємо інтерактивну функцію
if (require.main === module) {
  runInteractiveNFTMarketplace().catch((error) => {
    console.error('Error occurred:', error);
  });
}

// Експортуємо функції для використання в інших модулях
module.exports = {
  runNFTMarketplace,
  mintNFT,
  listNFTForSale,
  buyNFT,
  getAvailableNFTs
}; 