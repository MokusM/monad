const config = {
    // Curvance контракти на Monad
    CURVANCE_CONTRACTS: {
        VAULT: "0x...", // Адреса основного vault контракту
        LENDING_MARKET: "0x...", // Адреса ринку кредитування
        CVE_TOKEN: "0x..." // Адреса токену CVE
    },
    
    // API endpoints
    RPC_URL: "https://rpc.monad.xyz", // RPC URL для Monad
    
    // Налаштування газу
    GAS_SETTINGS: {
        maxFeePerGas: "auto",
        maxPriorityFeePerGas: "auto",
        gasLimit: 3000000
    },
    
    // Налаштування стратегії
    STRATEGY: {
        MIN_PROFIT: "0.1", // Мінімальний профіт для виконання операції
        MAX_SLIPPAGE: "1", // Максимальний допустимий слідж (1%)
        RETRY_ATTEMPTS: 3, // Кількість спроб для retry
        RETRY_DELAY: 1000 // Затримка між спробами (ms)
    }
};

module.exports = config; 