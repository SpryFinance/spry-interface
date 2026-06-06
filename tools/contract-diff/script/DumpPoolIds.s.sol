// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";

/// @notice Dumps real v4 PoolIds (PoolIdLibrary.toId) for a handful of PoolKeys,
///         so the spry-sdk poolId() port can be diffed against the canonical
///         keccak256(abi.encode(poolKey)). Read-only; writes only into this repo.
///
/// CSV columns: index,currency0,currency1,fee,tickSpacing,hooks,id
contract DumpPoolIds is Script {
    using PoolIdLibrary for PoolKey;

    string constant OUT = "../../packages/spry-sdk/test/fixtures/pool-ids.csv";

    function run() external {
        vm.writeFile(OUT, "index,currency0,currency1,fee,tickSpacing,hooks,id\n");
        _emit(0, address(uint160(1)), address(uint160(2)), 0x800000, 60, address(uint160(5)));
        _emit(1, address(uint160(1)), address(uint160(2)), 0x800000, 1, address(uint160(5)));
        _emit(2, address(0), address(uint160(0xAA)), 0x800000, 200, address(uint160(5)));
        _emit(3, address(uint160(0xBEEF)), address(uint160(0xCAFE)), 3000, 10, address(uint160(0x77)));
        _emit(4, address(uint160(0x1234)), address(uint160(0x5678)), 0x800000, 1000, address(0));
    }

    function _emit(uint256 i, address c0, address c1, uint24 fee, int24 ts, address hooks) internal {
        PoolKey memory k =
            PoolKey({currency0: Currency.wrap(c0), currency1: Currency.wrap(c1), fee: fee, tickSpacing: ts, hooks: IHooks(hooks)});
        bytes32 id = PoolId.unwrap(k.toId());
        vm.writeLine(
            OUT,
            string.concat(
                vm.toString(i),
                ",",
                vm.toString(c0),
                ",",
                vm.toString(c1),
                ",",
                vm.toString(uint256(fee)),
                ",",
                vm.toString(int256(ts)),
                ",",
                vm.toString(hooks),
                ",",
                vm.toString(id)
            )
        );
    }
}
