var ini = require("ini"),
    fs =require("fs"),
    extend = require("extend"),
    misc = require("./miscutils");

var Constraint = {
    OPTIONAL: "optional",
    MANDATORY: "mandatory",
    NOT_ALLOWED: "notallowed",
    TYPE: {
        STRING: "string", BOOLEAN: "boolean", NUMBER: "number", INTEGER: "integer",
        ARRAY: "array"
    }
};


var SectionTypeEnum = {
    ALL: "]ALL",
    GLOBAL: "]GLOBALS",
    SUBSECTIONS: "]SUBSECTIONS"
}

function ConfigChecker() {

    this.globalSectionConstraints = {};
    this.anySectionConstraints = {};
    this.constraints = {};
}

var MessageEnum = {
    INVALID_CONFIG_OBJECT: 0,
    MISSING_KEY: 1,
    WRONG_TYPE: 2,
    UNKNOWN_KEY: 3,
    KEY_NOT_ALLOWED: 4,


    mkMessage: function(code, arg, subSectionName) {
        return {code: code, arg: subSectionName?(subSectionName+":"+arg):arg};
    }

};

function messageToEnglishDescription(resultObject) {
    var message = undefined;
    switch(resultObject.code) {
        case MessageEnum.INVALID_CONFIG_OBJECT:
            message = "Invalid configuration object";
            break;
        case MessageEnum.MISSING_KEY:
            message = (resultObject.arg?resultObject.arg:"[unknown]") + " is not set";
            break;
        case MessageEnum.WRONG_TYPE:
            message = (resultObject.arg?resultObject.arg:"[unknown]") + " has an incompatible type";
            break;
        case MessageEnum.UNKNOWN_KEY:
            message = (resultObject.arg?resultObject.arg:"[unknown]") + " unknown (was it a typo?)";
            break;
        case MessageEnum.KEY_NOT_ALLOWED:
            message = (resultObject.arg?resultObject.arg:"[unknown]") + " is not allowed in this section";
            break;
        default:
            message = "Unknown error (" + JSON.stringify(resultObject) + ")";
            break;
    }
    return message;
}

function CheckResults() {
    this.errors = [];
    this.warnings = [];
}

CheckResults.prototype.getErrorMessages = function() {
    return this.errors.map(function(msg) {
        return messageToEnglishDescription(msg);
    });
}

CheckResults.prototype.getWarningMessages = function() {
    return this.warnings.map(function(msg) {
        return messageToEnglishDescription(msg);
    });
}

/**
 * Adds a constraint for a key in the section.
 * A constraint is an element of Constraint, or an array of Constraint element.
 * @param section
 * @param name
 * @param constraints a constraint or an array of constraints
 */
ConfigChecker.prototype.add = function(section, name, constraints) {
    if (typeof constraints == "string") {
        constraints = [constraints];
    }
    if (section === true) {
        section = "===ANY===";
    }
    var target;
    if (typeof section === "string") {
        if (this.constraints[section] === undefined) {
            this.constraints[section] = {};
        }
        target = this.constraints[section];
    }
    if (Array.isArray(target[name])) {
        constraints = target[name].concat(constraints);
    }
    target[name] = constraints;

    return this;
};

ConfigChecker.prototype.addAll= function(name, constraints) {
    return this.add(SectionTypeEnum.ALL, name, constraints);
};

ConfigChecker.prototype.addGlobalSection = function(name, constraints) {
    return this.add(SectionTypeEnum.GLOBAL, name, constraints);
};

ConfigChecker.prototype.addSubSections = function(name, constraints) {
    return this.add(SectionTypeEnum.SUBSECTIONS, name, constraints);
};

var TEST_BOOLEAN = /true|false|yes|no|on|off/i;
var TEST_NUMBER = /([0-9]+\.[0-9]+)|(\.[0-9]+)/;
var TEST_INTEGER = /[0-9]+/;

function checkConstraint(object, key, constraints, subsectionName) {
    constraints = Array.isArray(constraints)?constraints:[constraints];

    //if (object[key] === undefined && constraints.indexOf(Constraint.OPTIONAL)<0) {
    //    return MessageEnum.mkMessage(MessageEnum.MISSING_KEY, key, subsectionName);
    //}
    if (object[key] === undefined && constraints.indexOf(Constraint.MANDATORY)>=0) {
        return MessageEnum.mkMessage(MessageEnum.MISSING_KEY, key, subsectionName);
    }

    if (constraints.indexOf(Constraint.NOT_ALLOWED)>=0) {
        return MessageEnum.mkMessage(MessageEnum.KEY_NOT_ALLOWED, key, subsectionName);
    }

    var value = object[key];
    var isBoolean = TEST_BOOLEAN.test(value),
        isNumber = TEST_NUMBER.test(value),
        isInteger = TEST_INTEGER.test(value);

    if (Array.isArray(value) && constraints.indexOf(Constraint.TYPE.ARRAY)>=0) {
        // ok, nothing to do, value is already with the right type
    } else if (isBoolean && constraints.indexOf(Constraint.TYPE.BOOLEAN)>=0) {
        value = value.toLowerCase();
        object[key] = (value == "true" || value == "yes" || value == "on");
    } else if (isInteger && constraints.indexOf(Constraint.TYPE.INTEGER)>=0) {
        object[key] = parseInt(object[key]);
    } else if (isNumber && constraints.indexOf(Constraint.TYPE.NUMBER)>=0) {
        object[key] = parseFloat(object[key]);
    } else if (constraints.indexOf(Constraint.TYPE.STRING)>=0) {
        // ok, nothing to do, value is already with the right type
    } else if (constraints.indexOf(Constraint.TYPE.ARRAY)>=0) { // arrays are always arrays of string
        object[key] = [ object[key] ];
    } // and default is string
    return null;
}

function checkConstraints(result, configObject, constraints, subsection) {

    Object.keys(constraints).forEach(function(key) {
        var checked = checkConstraint(configObject, key, constraints[key], subsection);
        if (checked) { // every invalid check from an explicit constraint if an error
            result.errors.push(checked);
        }
    });

    Object.keys(configObject).forEach(function(key) {
        if (constraints[key] === undefined) {
            result.warnings.push(MessageEnum.mkMessage(MessageEnum.UNKNOWN_KEY, key, subsection));
        }
    });
}

ConfigChecker.prototype.verify = function(config) {
    var result = new CheckResults();

    if (typeof config != "object") {
        result.errors.push({code:MessageEnum.INVALID_CONFIG_OBJECT});
        return result;
    }

    // Check the global section
    var globalConfigObject = misc.extractConfigSectionData(config);
    var globalConstraints = extend(true, {}, this.constraints[SectionTypeEnum.GLOBAL] || {}, this.constraints[SectionTypeEnum.ALL] || {});
    checkConstraints(result, globalConfigObject, globalConstraints);


    var subSectionNames = Object.keys(config).filter(function(value) {
        return typeof config[value] == "object";
    });

    var self = this;
    subSectionNames.forEach(function(subSectionName) {
        var localConfigObject = misc.extractConfigSectionData(config, subSectionName);
        var constraintSet = extend(true, {}, self.constraints[subSectionName] || {}, self.constraints[SectionTypeEnum.SUBSECTIONS] || {}, self.constraints[SectionTypeEnum.ALL] || {});
        checkConstraints(result, localConfigObject, constraintSet, subSectionName);
    });

    return result;
};

module.exports.ConfigChecker = ConfigChecker;
module.exports.ConstraintEnum = Constraint;
module.exports.MessageEnum = MessageEnum;
