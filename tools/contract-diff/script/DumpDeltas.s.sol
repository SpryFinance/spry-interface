// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SmartFeeLib} from "spry/libs/SmartFeeLib.sol";

/// @notice Dumps real SmartFeeLib.computeSignedDelta outputs over a grid so the
///         spry-fee JS port can be diffed against the contract (pure integer
///         math, so the match is exact). Read-only.
///
/// CSV columns: sqrtPriceX96,liquidity,zeroForOne,amountSpecified,delta
contract DumpDeltas is Script {
    string constant OUT = "../../packages/spry-fee/test/fixtures/contract-deltas.csv";
    uint160 constant Q96 = uint160(1) << 96;

    function run() external {
        vm.writeFile(OUT, "sqrtPriceX96,liquidity,zeroForOne,amountSpecified,delta\n");

        uint160[3] memory prices;
        prices[0] = Q96; // price 1
        prices[1] = Q96 * 2; // price 4
        prices[2] = Q96 / 2; // price 0.25

        uint128[3] memory liqs;
        liqs[0] = 1e18;
        liqs[1] = 1e21;
        liqs[2] = 1e15;

        int256[6] memory amts; // negative = exact-in, positive = exact-out
        amts[0] = -1e15;
        amts[1] = -1e17;
        amts[2] = -1e18;
        amts[3] = 1e15;
        amts[4] = 1e17;
        amts[5] = 1e18;

        for (uint256 i = 0; i < prices.length; i++) {
            for (uint256 j = 0; j < liqs.length; j++) {
                for (uint256 b = 0; b < 2; b++) {
                    bool z = b == 0;
                    for (uint256 k = 0; k < amts.length; k++) {
                        int256 d = SmartFeeLib.computeSignedDelta(prices[i], liqs[j], z, amts[k]);
                        vm.writeLine(
                            OUT,
                            string.concat(
                                vm.toString(uint256(prices[i])),
                                ",",
                                vm.toString(uint256(liqs[j])),
                                ",",
                                z ? "1" : "0",
                                ",",
                                vm.toString(amts[k]),
                                ",",
                                vm.toString(d)
                            )
                        );
                    }
                }
            }
        }
    }
}
