/********************************************
 * time-calc:
 *********************************************/
"use strict";
const util = require("util");

const path = require("path");
const hlp = require(path.join(__dirname, "/lib/sunPosHelper.js"));
//const cron = require("cron");

module.exports = function (RED) {
    "use strict";

    function tsGetOperandData(
        node,
        msg,
        type,
        value,
        format,
        offset,
        multiplier
    ) {
        let result = {};
        if (type == null || type === "none" || type === "") {
            return Date.now();
        } else if (
            type === "entered" ||
            type === "pdsTime" ||
            type === "pdmTime" ||
            type === "date"
        ) {
            result = node.positionConfig.getTimeProp(node, msg, type, value);
            if (result == null) {
                throw new Error("could not evaluate " + type + "." + value);
            } else if (result.error) {
                throw new Error("error on getting operand: " + result.error);
            }
        } else {
            //msg, flow, global, str, num, env
            let data = RED.util.evaluateNodeProperty(value, type, node, msg);
            if (!data) {
                throw new Error("could not evaluate " + type + "." + value);
            }
            result.value = hlp.parseDateFromFormat(
                data,
                format,
                RED._("time-calc.days"),
                RED._("time-calc.month"),
                RED._("time-calc.dayDiffNames")
            );

            if (result.value === "Invalid Date" || isNaN(result.value)) {
                throw new Error("could not evaluate format of " + data);
            }
        }
        if (offset != 0 && multiplier > 0) {
            return new Date(result.value.getTime() + offset * multiplier);
        } else if (offset !== 0 && multiplier == -1) {
            result.value.setMonth(result.value.getMonth() + offset);
        } else if (offset !== 0 && multiplier == -2) {
            result.value.setFullYear(result.value.getFullYear() + offset);
        }
        return result.value;
    }

    function tsGetPropData(node, msg, type, value, format, offset, days) {
        if (type == null || type === "none" || type === "") {
            if (value === "" || typeof value === "undefined") {
                return Date.now();
            } else {
                return value;
            }
        } else if (type === "pdsCalcData") {
            return node.positionConfig.getSunCalc(msg.ts);
        } else if (type === "pdmCalcData") {
            return node.positionConfig.getMoonCalc(msg.ts);
        } else if (
            type === "entered" ||
            type === "pdsTime" ||
            type === "pdmTime" ||
            type === "date"
        ) {
            let data = node.positionConfig.getTimeProp(
                node,
                msg,
                type,
                value,
                offset,
                1,
                days
            );
            if (!data.error) {
                return hlp.getFormatedDateOut(
                    data.value,
                    format,
                    false,
                    RED._("time-inject.days"),
                    RED._("time-inject.month"),
                    RED._("time-inject.dayDiffNames")
                );
            }
            return data;
        }
        return RED.util.evaluateNodeProperty(value, type, node, msg);
    }

    function timeCalcNode(config) {
        RED.nodes.createNode(this, config);
        // Retrieve the config node
        this.positionConfig = RED.nodes.getNode(config.positionConfig);
        //this.debug('initialize timeCalcNode ' + util.inspect(config));
        let operator = config.operator || 0;
        var node = this;

        this.on("input", msg => {
            try {
                node.debug("input " + util.inspect(msg));
                if (
                    node.positionConfig == null ||
                    config.operator == null ||
                    config.operand1Type == null
                ) {
                    throw new Error("Configuration is missing!!");
                }
                let operand1 = tsGetOperandData(this, msg, config.operand1Type, config.operand1, config.operand1Format, config.operand1Offset, config.operand1OffsetMultiplier);

                if (config.result1Type !== "none" && config.result1Value) {
                    let resObj = null;
                    if (config.result1Type == "operand1") {
                        resObj = hlp.getFormatedDateOut(operand1, config.result1Format, false, RED._("time-inject.days"), RED._("time-inject.month"), RED._("time-inject.dayDiffNames"));
                    } else {
                        resObj = tsGetPropData(node, msg, config.result1ValueType, config.result1Value, config.result1Format, config.result1Offset);
                    }
                    node.debug("resObj " + util.inspect(resObj));
                    if (resObj == null) {
                        throw new Error("could not evaluate " + config.result1ValueType + "." + config.result1Value);
                    } else if (resObj.error) {
                        this.error("error on getting result: " + resObj.error);
                    } else if (config.result1Type === "msg" || config.result1Type === "msgProperty") {
                        RED.util.setMessageProperty(msg, name, resObj);
                    } else if ((config.result1Type === "flow" || config.result1Type === "global") && (operator <= 0 || result)) {
                        let contextKey = RED.util.parseContextStore(name);
                        node.context()[type].set(contextKey.key, resObj, contextKey.store);
                    }
                }

                node.debug("operand1 " + util.inspect(operand1));
                let resObj = null;
                let rules = config.rules;
                let rulesLength = rules.length;
                for (let i = 0; i < rulesLength; ++i) {
                    let rule = rules[i];
                    let operatorValid = true;
                    if (rule.propertyType !== "none") {
                        let res = RED.util.evaluateNodeProperty(rule.propertyValue, rule.propertyType, node, msg);
                        operatorValid = res == true || res == "true";
                    }
                    if (operatorValid) {
                        let ruleoperand = tsGetOperandData(this, msg, rule.operandType, rule.operandValue, rule.format, rule.offsetType, rule.offsetValue, rule.multiplier);
                        node.debug("operand " + util.inspect(ruleoperand));
                        node.debug("operator " + util.inspect(rule.operator));
                        let result = false;
                        let inputOperant = new Date(operand1);

                        let opHigh = Math.trunc(rule.operator / 10);
                        let opLow = rule.operator % 10;

                        switch (opHigh) {
                            case 2: //sec
                                inputOperant.setMilliseconds(0);
                                ruleoperand.setMilliseconds(0);
                                break;
                            case 2: //min
                                inputOperant.setMilliseconds(0);
                                inputOperant.setSeconds(0);
                                ruleoperand.setMilliseconds(0);
                                ruleoperand.setSeconds(0);
                                break;
                            case 3: //hour
                                inputOperant.setMilliseconds(0);
                                inputOperant.setSeconds(0);
                                inputOperant.setMinutes(0);
                                ruleoperand.setMilliseconds(0);
                                ruleoperand.setSeconds(0);
                                ruleoperand.setMinutes(0);
                                break;
                            case 4: //date
                                inputOperant.setMilliseconds(0);
                                inputOperant.setSeconds(0);
                                inputOperant.setMinutes(0);
                                inputOperant.setHours(0);
                                ruleoperand.setMilliseconds(0);
                                ruleoperand.setSeconds(0);
                                ruleoperand.setMinutes(0);
                                ruleoperand.setHours(0);
                                break;
                            case 5: //month
                                inputOperant.setMilliseconds(0);
                                inputOperant.setSeconds(0);
                                inputOperant.setMinutes(0);
                                inputOperant.setHours(0);
                                inputOperant.setDate(0);
                                ruleoperand.setMilliseconds(0);
                                ruleoperand.setSeconds(0);
                                ruleoperand.setMinutes(0);
                                ruleoperand.setHours(0);
                                ruleoperand.setDate(0);
                                break;
                            case 11: //only sec
                                inputOperant = inputOperant.getSeconds();
                                ruleoperand = ruleoperand.getSeconds();
                                break;
                            case 12: //only min
                                inputOperant = inputOperant.getMinutes();
                                ruleoperand = ruleoperand.getMinutes();
                                break;
                            case 13: //only hour
                                inputOperant = inputOperant.getHours();
                                ruleoperand = ruleoperand.getHours();
                                break;
                            case 14: //only day
                                inputOperant = inputOperant.getDate();
                                ruleoperand = ruleoperand.getDate();
                                break;
                            case 15: //only dayOfWeek
                                inputOperant = inputOperant.getDay() + 1;
                                ruleoperand = ruleoperand.getDay() + 1;
                                break;
                            case 16: //only Month
                                inputOperant = inputOperant.getMonth() + 1;
                                ruleoperand = ruleoperand.getMonth() + 1;
                                break;
                            case 17: //only FullYear
                                inputOperant = inputOperant.getFullYear();
                                ruleoperand = ruleoperand.getFullYear();
                                break;
                        }
                        switch (opLow) {
                            case 1: //equal             { id: 1, group: "ms", label: "==", "text": "equal" },
                                result = inputOperant.getTime() == ruleoperand.getTime();
                                break;
                            case 2: //unequal           { id: 2, group: "ms", label: "!=", "text": "unequal" },
                                result = inputOperant.getTime() != ruleoperand.getTime();
                                break;
                            case 3: //greater           { id: 3, group: "ms", label: ">", "text": "greater" },
                                result = inputOperant.getTime() > ruleoperand.getTime();
                                break;
                            case 4: //greaterOrEqual    { id: 5, group: "ms", label: ">=", "text": "greater or equal" },
                                result = inputOperant.getTime() >= ruleoperand.getTime();
                                break;
                            case 5: //lesser            { id: 6, group: "ms", label: "<", "text": "lesser" },
                                result = inputOperant.getTime() < ruleoperand.getTime();
                                break;
                            case 6: //lesserOrEqual     { id: 7, group: "ms", label: "<=", "text": "lesser or equal" },
                                result = inputOperant.getTime() <= ruleoperand.getTime();
                                break;
                        }

                        if (result) {
                            resObj.push(msg);
                        } else {
                            resObj.push(null);
                        }
                        if (!config.checkall) {
                            break;
                        }
                    }
                }
                for (let i = resObj.length; i < rulesLength; ++i) {
                    resObj.push(null);
                }
                resObj.push(msg);
                return resObj;
            } catch (err) {
                hlp.errorHandler(
                    this,
                    err,
                    RED._("time-calc.errors.error-text"),
                    RED._("time-calc.errors.error-title")
                );
            }
        });
    }
    RED.nodes.registerType("time-calc", timeCalcNode);

    /*
      RED.httpAdmin.get('/sun-position/js/*', function(req,res) {
          var options = {
            root: __dirname + '/static/',
            dotfiles: 'deny'
          };
          res.sendFile(req.params[0], options);
      });/* */
};