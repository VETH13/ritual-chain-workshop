// Bilingual dictionary for the game
export type Lang = "en" | "zh";

export const I18N = {
  en: {
    // Header
    tagline: "Verifiable-AI bounty hunt on Ritual testnet",
    streak: "Streak",
    best: "best",
    connectWallet: "Connect Wallet",
    connecting: "Connecting...",
    wrongNetwork: "Wrong network — switch to Ritual testnet (Chain ID 10211)",
    switch: "Switch",
    noWallet: "No EVM wallet found. Install MetaMask or any EVM wallet extension.",
    failedConnect: "Failed to connect wallet",

    // Hero
    badgeOnchain: "On-chain · Verifiable AI",
    heroTitleA: "The cat is ",
    heroTitleAEmph: "AI",
    heroTitleB: ". The mouse is ",
    heroTitleBEmph: "you",
    heroTitleC: ".",
    heroDesc:
      "A verifiable-AI bounty hunt on Ritual testnet. The cat's next move is decided by an LLM inference anchored on-chain. Survive 60 seconds, collect CHEESE, win your wager back at the multiplier set by your difficulty tier.",

    // Difficulty
    choosePredator: "Choose your predator",
    kitten: "Kitten 🐱",
    hunter: "Hunter 🐯",
    strategist: "Strategist 🦁",
    kittenDesc: "Clumsy AI, random walk. Easy 1.5x payout.",
    hunterDesc: "Greedy chase with 1-step prediction. 2.5x payout.",
    strategistDesc: "Deep predictive inference, ambush logic. 5x payout.",

    // Wager
    wagerLabel: "Wager (CHEESE)",
    winAmount: "win",
    balanceLabel: "Balance",

    // Buttons
    startHunt: "Start Hunt",
    claimFaucet: "Claim 1000 CHEESE from faucet",
    connectToPlay: "Connect wallet to start playing",
    playAgain: "Play Again",
    pause: "Pause",
    resume: "Resume",

    // HUD
    timeLeft: "Time Left",
    score: "Score",
    aiInferences: "AI Inferences",
    difficulty: "Difficulty",

    // Status
    speedBoost: "Speed Boost",
    safeInHole: "Safe in Hole",
    aiStrategy: "AI Strategy",
    conf: "Conf",
    controlsHint:
      "Press SPACE to drop a decoy · WASD/arrows to move · Don't get caught",

    // Live feed
    liveFeed: "Live AI Inference Feed",
    liveFeedDesc:
      "Each tick is an LLM call simulating Ritual's verifiable oracle",
    latestStrategy: "Latest strategy",
    confidence: "Confidence",
    inferencesSoFar: "Inferences so far",
    anchorTitle: "ritual testnet anchor",

    // Ended screen
    survivedTitle: "YOU SURVIVED!",
    caughtTitle: "CAUGHT!",
    survivedDesc:
      "The AI cat couldn't catch you. {label} difficulty conquered.",
    caughtDesc: "The {label} AI caught you in {sec}s.",
    statSurvived: "Survived",
    statCheese: "Cheese",
    statInferences: "AI Inferences",
    wager: "Wager",
    payout: "Payout",
    lost: "Lost",
    ritualAnchor: "Ritual testnet anchor",
    txHash: "tx_hash",
    inferenceHash: "inference_hash",
    pending: "pending...",
    viewOnExplorer: "View on Ritual Explorer",

    // How to play
    howToPlay: "How to play",
    move: "Move",
    moveDesc: "WASD or arrow keys. You are the cyan mouse.",
    collectCheese: "Collect Cheese",
    collectCheeseDesc: "+50 score each. They respawn after 3s.",
    hideInHoles: "Hide in Holes",
    hideInHolesDesc: "3 safe zones. Invincible while inside.",
    grabBoosts: "Grab Boosts",
    grabBoostsDesc: "Speed boost for 4 seconds.",
    dropDecoy: "Drop Decoy",
    dropDecoyDesc: "Drop a fake mouse to confuse the AI cat.",
    survive60s: "Survive 60s",
    survive60sDesc: "Outlast the timer to win your wager.",
    aiInference: "AI Inference",
    aiInferenceDesc: "Each cat move is verifiable AI on Ritual.",
    multiplierPayout: "Multiplier Payout",
    multiplierPayoutDesc: "Kitten 1.5x · Hunter 2.5x · Strategist 5x",

    // Leaderboard
    leaderboard: "Leaderboard",
    leaderboardDesc: "Top survivors across all Ritual testnet players",
    noSurvivors: "No survivors yet. Be the first!",
    yourLastRuns: "Your last runs",
    noGames: "No games yet. Click Start Hunt above.",

    // Toasts
    connectFirst: "Connect your wallet first",
    switchToRitual: "Please switch to Ritual testnet",
    insufficientCheese: "Insufficient CHEESE balance. Claim from faucet.",
    survived: "Survived! Won {n} CHEESE!",
    caughtYou: "Cat caught you. Lost {n} CHEESE.",
    failedSave: "Failed to save game record",
    faucetFailed: "Faucet failed",
    faucetClaimFailed: "Faucet claim failed",

    // Footer
    footerBuiltOn: "Built on",
    footerAi: "AI inference via",
    footerNotReal: "Not real money, just CHEESE",
    docs: "Docs",
    explorer: "Explorer",

    // Misc
    seconds: "s",
  },
  zh: {
    tagline: "Ritual 测试网上的可验证 AI 赏金猎杀",
    streak: "连胜",
    best: "最佳",
    connectWallet: "连接钱包",
    connecting: "连接中...",
    wrongNetwork: "网络错误 — 请切换到 Ritual 测试网（Chain ID 10211）",
    switch: "切换",
    noWallet: "未检测到 EVM 钱包，请安装 MetaMask 或其他 EVM 钱包扩展。",
    failedConnect: "钱包连接失败",

    badgeOnchain: "链上 · 可验证 AI",
    heroTitleA: "猫是 ",
    heroTitleAEmph: "AI",
    heroTitleB: "。鼠是 ",
    heroTitleBEmph: "你",
    heroTitleC: "。",
    heroDesc:
      "Ritual 测试网上的可验证 AI 赏金猎杀游戏。猫的每一步行动都由链上锚定的 LLM 推理决定。活满 60 秒，收集 CHEESE，按难度倍数赢回赌注。",

    choosePredator: "选择你的猎食者",
    kitten: "小猫 🐱",
    hunter: "猎手 🐯",
    strategist: "谋士 🦁",
    kittenDesc: "笨拙 AI，随机走位。1.5 倍简单赔付。",
    hunterDesc: "贪心追击 + 1 步预测。2.5 倍赔付。",
    strategistDesc: "深度预测推理 + 埋伏逻辑。5 倍赔付。",

    wagerLabel: "下注 (CHEESE)",
    winAmount: "赢得",
    balanceLabel: "余额",

    startHunt: "开始猎杀",
    claimFaucet: "从水龙头领取 1000 CHEESE",
    connectToPlay: "连接钱包开始游戏",
    playAgain: "再玩一局",
    pause: "暂停",
    resume: "继续",

    timeLeft: "剩余时间",
    score: "得分",
    aiInferences: "AI 推理次数",
    difficulty: "难度",

    speedBoost: "速度加成",
    safeInHole: "洞中无敌",
    aiStrategy: "AI 策略",
    conf: "置信度",
    controlsHint: "空格放诱饵 · WASD/方向键移动 · 别被抓住",

    liveFeed: "AI 推理实时流",
    liveFeedDesc: "每次推理都是一次 LLM 调用，模拟 Ritual 可验证预言机",
    latestStrategy: "最新策略",
    confidence: "置信度",
    inferencesSoFar: "累计推理次数",
    anchorTitle: "ritual 测试网锚定",

    survivedTitle: "你活下来了！",
    caughtTitle: "被抓了！",
    survivedDesc: "AI 猫没能抓住你。{label} 难度已征服。",
    caughtDesc: "{label} AI 在 {sec} 秒内抓住了你。",
    statSurvived: "存活",
    statCheese: "奶酪",
    statInferences: "AI 推理",
    wager: "下注",
    payout: "赔付",
    lost: "损失",
    ritualAnchor: "Ritual 测试网锚定",
    txHash: "交易哈希",
    inferenceHash: "推理哈希",
    pending: "等待中...",
    viewOnExplorer: "在 Ritual 浏览器查看",

    howToPlay: "玩法说明",
    move: "移动",
    moveDesc: "WASD 或方向键。你是青色老鼠。",
    collectCheese: "收集奶酪",
    collectCheeseDesc: "每个 +50 分，3 秒后重生。",
    hideInHoles: "躲进鼠洞",
    hideInHolesDesc: "3 个安全区，进入时无敌。",
    grabBoosts: "拾取加成",
    grabBoostsDesc: "4 秒速度加成。",
    dropDecoy: "放下诱饵",
    dropDecoyDesc: "放下假鼠迷惑 AI 猫。",
    survive60s: "存活 60 秒",
    survive60sDesc: "撑过计时器赢得赌注。",
    aiInference: "AI 推理",
    aiInferenceDesc: "猫的每一步都是 Ritual 上可验证的 AI。",
    multiplierPayout: "倍数赔付",
    multiplierPayoutDesc: "小猫 1.5x · 猎手 2.5x · 谋士 5x",

    leaderboard: "排行榜",
    leaderboardDesc: "Ritual 测试网所有玩家的存活榜",
    noSurvivors: "还没有存活者，成为第一个！",
    yourLastRuns: "你最近的局",
    noGames: "还没有对局，点击上方开始猎杀。",

    connectFirst: "请先连接钱包",
    switchToRitual: "请切换到 Ritual 测试网",
    insufficientCheese: "CHEESE 余额不足，请从水龙头领取。",
    survived: "活下来了！赢得 {n} CHEESE！",
    caughtYou: "猫抓住你了。损失 {n} CHEESE。",
    failedSave: "游戏记录保存失败",
    faucetFailed: "水龙头领取失败",
    faucetClaimFailed: "水龙头领取失败",

    footerBuiltOn: "构建于",
    footerAi: "AI 推理来自",
    footerNotReal: "非真钱，只是 CHEESE",
    docs: "文档",
    explorer: "浏览器",

    seconds: "秒",
  },
} as const;

export type Dict = (typeof I18N)["en"];

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
