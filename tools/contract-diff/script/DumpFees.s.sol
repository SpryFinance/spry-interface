// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";

import {SpryHook} from "spry/SpryHook.sol";
import {SmartFeeLib} from "spry/libs/SmartFeeLib.sol";
import {SpryFeeParams} from "spry/libs/SpryFeeTypes.sol";

/// @notice Dumps the real on-chain outputs of `SpryHook.tierParams`,
///         `SmartFeeLib.feeForDelta`, `marginalFee`, `zoneOf`, and
///         `dispatchCase` over a grid, as a CSV the spry-fee test suite diffs
///         its JavaScript port against. Pure read-only: nothing here mutates
///         the spry-contracts repo. The hook is instantiated with a dummy pool
///         manager because the functions exercised never touch it.
///
/// CSV columns: kind,tier,a,b,value
///   kind=param: a=fieldIndex(0..15), value=field value
///   kind=fee:   a=delta,             value=feeForDelta (pips)
///   kind=zone:  a=delta,             value=zoneOf id (0..3)
///   kind=marg:  a=cumBefore, b=cumAfter, value=marginalFee (pips)
///   kind=disp:  a=cumBefore, b=cumAfter, value=dispatchCase id (0..2)
contract DumpFees is Script {
    string constant OUT = "../../packages/spry-fee/test/fixtures/contract-fees.csv";

    function run() external {
        vm.writeFile(OUT, "kind,tier,a,b,value\n");

        SpryHook hook = new SpryHook(IPoolManager(address(1)), 1);

        // Cumulative grid for marginalFee/dispatchCase (covers every tier's
        // zones on both signs, plus zero / unwind / growth / flip transitions).
        int256[14] memory cums;
        cums[0] = -5000;
        cums[1] = -1000;
        cums[2] = -500;
        cums[3] = -250;
        cums[4] = -100;
        cums[5] = -50;
        cums[6] = 0;
        cums[7] = 50;
        cums[8] = 100;
        cums[9] = 250;
        cums[10] = 334;
        cums[11] = 500;
        cums[12] = 1000;
        cums[13] = 5000;

        for (uint8 t = 0; t < 5; t++) {
            SpryFeeParams memory p = hook.tierParams(t);
            _dumpParams(t, p);
            _dumpCurve(t, p);
            _dumpMarginal(t, p, cums);
        }
    }

    function _line(string memory kind, uint8 tier, int256 a, int256 b, int256 value) internal {
        vm.writeLine(
            OUT,
            string.concat(
                kind,
                ",",
                vm.toString(uint256(tier)),
                ",",
                vm.toString(a),
                ",",
                vm.toString(b),
                ",",
                vm.toString(value)
            )
        );
    }

    function _dumpParams(uint8 t, SpryFeeParams memory p) internal {
        _line("param", t, 0, 0, int256(p.safeLow));
        _line("param", t, 1, 0, int256(p.safeHigh));
        _line("param", t, 2, 0, int256(p.alertLow));
        _line("param", t, 3, 0, int256(p.alertHigh));
        _line("param", t, 4, 0, int256(p.dangerLow));
        _line("param", t, 5, 0, int256(p.dangerHigh));
        _line("param", t, 6, 0, int256(p.aLeft));
        _line("param", t, 7, 0, int256(p.bLeft));
        _line("param", t, 8, 0, int256(p.aRight));
        _line("param", t, 9, 0, int256(p.bRight));
        _line("param", t, 10, 0, int256(p.aLeftExp));
        _line("param", t, 11, 0, int256(p.bLeftExp));
        _line("param", t, 12, 0, int256(p.aRightExp));
        _line("param", t, 13, 0, int256(p.bRightExp));
        _line("param", t, 14, 0, int256(uint256(p.safeFee)));
        _line("param", t, 15, 0, int256(uint256(p.capFee)));
    }

    function _dumpCurve(uint8 t, SpryFeeParams memory p) internal {
        // Dense sweep covering safe / alert / danger / cap on both signs.
        for (int256 d = -2200; d <= 5400; d += 20) {
            _emitCurvePoint(t, p, d);
        }
        // Exact zone boundaries and their immediate neighbours.
        int256[6] memory bounds;
        bounds[0] = int256(p.safeLow);
        bounds[1] = int256(p.safeHigh);
        bounds[2] = int256(p.alertLow);
        bounds[3] = int256(p.alertHigh);
        bounds[4] = int256(p.dangerLow);
        bounds[5] = int256(p.dangerHigh);
        for (uint256 i = 0; i < 6; i++) {
            _emitCurvePoint(t, p, bounds[i] - 1);
            _emitCurvePoint(t, p, bounds[i]);
            _emitCurvePoint(t, p, bounds[i] + 1);
        }
    }

    function _emitCurvePoint(uint8 t, SpryFeeParams memory p, int256 d) internal {
        _line("fee", t, d, 0, int256(uint256(SmartFeeLib.feeForDelta(d, p))));
        _line("zone", t, d, 0, int256(uint256(SmartFeeLib.zoneOf(d, p))));
    }

    function _dumpMarginal(uint8 t, SpryFeeParams memory p, int256[14] memory cums) internal {
        for (uint256 i = 0; i < cums.length; i++) {
            for (uint256 j = 0; j < cums.length; j++) {
                int256 cb = cums[i];
                int256 ca = cums[j];
                _line("marg", t, cb, ca, int256(uint256(SmartFeeLib.marginalFee(cb, ca, p))));
                _line("disp", t, cb, ca, int256(uint256(SmartFeeLib.dispatchCase(cb, ca))));
            }
        }
    }
}
