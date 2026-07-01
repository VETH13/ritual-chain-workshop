// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title InferenceRegistry
 * @notice Anchors verifiable AI inference proofs for the Ritual Cat × Chain Mouse game.
 *         Each game record is committed on-chain with:
 *           - inferenceHash (bytes32): hash of the AI inference payload
 *           - difficulty (uint8): 0=kitten, 1=hunter, 2=strategist
 *           - survived (bool): whether the mouse survived 60s
 *           - cheeseCollected (uint16): cheese count gathered
 *
 *         Records are queryable by player address. The contract emits an event
 *         for each record so off-chain indexers (the Next.js API) can listen
 *         and update the leaderboard.
 */
contract InferenceRegistry {
    // ---------------------------------------------------------------------
    // Structs & Storage
    // ---------------------------------------------------------------------

    struct GameRecord {
        bytes32 inferenceHash;
        uint8 difficulty; // 0=kitten, 1=hunter, 2=strategist
        bool survived;
        uint16 cheeseCollected;
        uint64 timestamp;
    }

    /// @dev Player address → array of game records
    mapping(address => GameRecord[]) private s_records;

    /// @dev Player address → record count (cheaper than reading array length)
    mapping(address => uint256) public getRecordCount;

    /// @dev Total records across all players
    uint256 public totalRecords;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event GameRecorded(
        address indexed player,
        bytes32 indexed inferenceHash,
        uint8 difficulty,
        bool survived,
        uint16 cheeseCollected,
        uint64 timestamp
    );

    // ---------------------------------------------------------------------
    // External API
    // ---------------------------------------------------------------------

    /**
     * @notice Anchor a game result on-chain. Called by the player's wallet
     *         via eth_sendTransaction after each game ends.
     *
     * @param inferenceHash   Hash of the AI inference payload (FNV-1a, 32 bytes).
     * @param difficulty      0=kitten, 1=hunter, 2=strategist.
     * @param survived        True if mouse survived 60s.
     * @param cheeseCollected Cheese count gathered during the game.
     */
    function recordGame(
        bytes32 inferenceHash,
        uint8 difficulty,
        bool survived,
        uint16 cheeseCollected
    ) external {
        require(inferenceHash != bytes32(0), "inferenceHash cannot be zero");
        require(difficulty <= 2, "difficulty must be 0, 1, or 2");

        GameRecord memory rec = GameRecord({
            inferenceHash: inferenceHash,
            difficulty: difficulty,
            survived: survived,
            cheeseCollected: cheeseCollected,
            timestamp: uint64(block.timestamp)
        });

        s_records[msg.sender].push(rec);
        getRecordCount[msg.sender] += 1;
        totalRecords += 1;

        emit GameRecorded(
            msg.sender,
            inferenceHash,
            difficulty,
            survived,
            cheeseCollected,
            rec.timestamp
        );
    }

    // ---------------------------------------------------------------------
    // View functions
    // ---------------------------------------------------------------------

    /**
     * @notice Get a specific record for a player.
     */
    function getRecord(
        address player,
        uint256 index
    )
        external
        view
        returns (
            bytes32 inferenceHash,
            uint8 difficulty,
            bool survived,
            uint16 cheeseCollected,
            uint64 timestamp
        )
    {
        require(index < s_records[player].length, "index out of bounds");
        GameRecord storage rec = s_records[player][index];
        return (
            rec.inferenceHash,
            rec.difficulty,
            rec.survived,
            rec.cheeseCollected,
            rec.timestamp
        );
    }

    /**
     * @notice Get the most recent record for a player.
     *         Returns zero values if the player has no records.
     */
    function getLatestRecord(
        address player
    )
        external
        view
        returns (
            bytes32 inferenceHash,
            uint8 difficulty,
            bool survived,
            uint16 cheeseCollected,
            uint64 timestamp,
            uint256 totalForPlayer
        )
    {
        uint256 count = s_records[player].length;
        if (count == 0) {
            return (bytes32(0), 0, false, 0, 0, 0);
        }
        GameRecord storage rec = s_records[player][count - 1];
        return (
            rec.inferenceHash,
            rec.difficulty,
            rec.survived,
            rec.cheeseCollected,
            rec.timestamp,
            count
        );
    }
}
