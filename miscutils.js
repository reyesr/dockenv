var trim = require("trim");

module.exports.interpolate = function interpolate(str, data) {
    function interpolator(a,b) {
        var r = data[b];
        return typeof r === 'string' || typeof r === 'number' ? r : a;
    }

    return str.replace(/\$([a-zA-Z0-9]+)/g, interpolator).replace(/\${([a-zA-Z0-9]+)}/g, interpolator)
};
function getUserHome() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
};
module.exports.getUserHome = getUserHome;

var userHome = getUserHome();

module.exports.interpolatePath = function(path) {
    path = module.exports.interpolate(path, { 'HOME': userHome });
    if (path.substr(0,1) == '~') {
        path = getUserHome() + path.substring(1);
    }
    return path;
};

module.exports.extractConfigSectionNames = function(config) {
    return Object.keys(config).filter(function(key) {
        return typeof config[key] == "object";
    })
};

module.exports.extractConfigSectionData = function extractConfigSectionData(config, sectionName) {
    var isGlobal = sectionName === undefined;
    var target = isGlobal ? config : config[sectionName];

    if (typeof target != "object") {
        return {};
    }

    var extracted = {};
    Object.keys(target).forEach(function(key) {
        //
        // global sections do not contain object values, because those are
        // subsections, so we only add them in subsections
        if (typeof target[key] != "object" || !isGlobal) {
            extracted[key] = target[key];
        }
    });
    return extracted;
};

module.exports.toArray = function(element, separator) {
    if (Array.isArray(element)) {
        return element;
    }
    if (typeof element == "string" && separator) {
        return element.split(separator).map(function(str) {
            return trim(str);
        });
    } else if (element === undefined) {
        return [];
    }
    return [element];
};
