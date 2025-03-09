/**
 * Утиліти для роботи з гаманцями в проекті Monad Multi Wallet Manager
 */

const ethers = require('ethers');
const colors = require('colors');

/**
 * Перемішує масив за алгоритмом Fisher-Yates
 * @param {Array} array - масив для перемішування 
 * @param {string} seed - seed для генератора випадкових чисел
 * @returns {Array} - перемішаний масив
 */
function shuffleArray(array, seed = 'random') {
    const newArray = [...array]; // Створюємо копію масиву, щоб не змінювати оригінал
    
    // Створюємо простий генератор випадкових чисел на основі seed
    const randomGenerator = () => {
        if (seed === 'random') {
            return Math.random();
        } else {
            // Простий детермінований генератор на основі рядка seed
            let hash = 0;
            for (let i = 0; i < seed.length; i++) {
                hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                hash |= 0; // Перетворюємо на 32-бітне ціле
            }
            
            // Поточний час для більшої випадковості, але якщо seed фіксований, 
            // то буде послідовність, що повторюється, а не завжди одна й та ж
            const currentTimestamp = Date.now(); 
            return Math.abs(Math.sin(hash + currentTimestamp)) % 1;
        }
    };
    
    // Алгоритм Fisher-Yates shuffle
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(randomGenerator() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    
    return newArray;
}

/**
 * Отримує перемішаний (або ні) набір гаманців з конфігурації
 * @param {Object} config - конфігураційний об'єкт
 * @returns {Object} - { wallets, proxies } масиви приватних ключів та проксі
 */
function getWallets(config) {
    const wallets = config.WALLETS || [];
    const proxies = config.PROXIES || [];
    
    if (wallets.length === 0) {
        console.log('❌ Не знайдено жодного гаманця в конфігурації'.red);
        return { wallets: [], proxies: [] };
    }
    
    // Перевіряємо, чи потрібно перемішувати гаманці
    if (config.PRIVACY && config.PRIVACY.SHUFFLE_WALLETS) {
        const seed = config.PRIVACY.SHUFFLE_SEED || 'random';
        console.log(`🔀 ${colors.cyan('Перемішуємо гаманці для підвищення приватності')} (${seed !== 'random' ? 'детерміновано' : 'випадково'})`);
        
        // Створюємо пари [гаманець, проксі] для збереження відповідності
        const pairs = wallets.map((wallet, index) => ({
            wallet,
            proxy: proxies[index % proxies.length]
        }));
        
        // Перемішуємо пари
        const shuffledPairs = shuffleArray(pairs, seed);
        
        // Розділяємо назад на масиви
        const shuffledWallets = shuffledPairs.map(pair => pair.wallet);
        const shuffledProxies = shuffledPairs.map(pair => pair.proxy);
        
        return { wallets: shuffledWallets, proxies: shuffledProxies };
    }
    
    return { wallets, proxies };
}

/**
 * Форматує адресу для виведення (скорочена форма)
 * @param {string} address - Ethereum адреса
 * @returns {string} - скорочена форма адреси
 */
function formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Форматує число з обмеженою кількістю десяткових знаків
 * @param {number|string|BigNumber} value - значення для форматування
 * @param {number} decimals - кількість десяткових знаків
 * @returns {string} - форматоване число
 */
function formatNumber(value, decimals = 4) {
    if (!value) return '0'.padEnd(decimals + 2, '0');
    
    // Якщо це BigNumber, конвертуємо в рядок, а потім в число
    if (typeof value === 'object' && value._isBigNumber) {
        value = parseFloat(ethers.utils.formatEther(value));
    }
    
    // Конвертуємо рядок в число, якщо потрібно
    if (typeof value === 'string') {
        value = parseFloat(value);
    }
    
    // Форматуємо число
    return value.toFixed(decimals);
}

/**
 * Додає випадкову затримку
 * @param {number} minMs - мінімальна затримка в мс
 * @param {number} maxMs - максимальна затримка в мс
 * @returns {Promise} - проміс, який вирішується після затримки
 */
function randomDelay(minMs = 500, maxMs = 2500) {
    const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
}

module.exports = {
    shuffleArray,
    getWallets,
    formatAddress,
    formatNumber,
    randomDelay
}; 