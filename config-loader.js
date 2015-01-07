var ini = require("ini"),
    fs =require("fs"),
    extend = require("extend"),
    misc = require("./miscutils");

function Loader() {
    if (!(this instanceof Loader)) {
        return new Loader()
    }
    this.config = {};
}

Loader.prototype.get = function() {
    return this.config;
};

function ensuresAllKeysAreLowercase(obj) {
    Object.keys(obj).forEach(function(key) {
        var lowercased = key.toLowerCase();
        if (key != lowercased) {
            if (obj[lowercased]!==undefined) {
                throw new Error("Configuration key found twice (" + key + " and " + lowercased +")");
            }
            var value = obj[key];
            delete obj[key];
            obj[lowercased] = value;
            key = lowercased;
        }
        if (misc.isObject(obj[key])) {
            ensuresAllKeysAreLowercase(obj[key]);
        }
    });
}

/**
 * Loads a configuration file and mix it with the current configuration.
 * In other words, load() can be called several times, each successive configuration
 * supercedes the preceeding ones.
 *
 * @param filepath the path to a file to load
 * @returns {{}|*}
 */
Loader.prototype.load = function(filepath, throwIfInvalid) {
    filepath = misc.interpolate(filepath, { 'HOME': misc.getUserHome() });
    if (filepath.substr(0,1) == '~') {
        filepath = misc.getUserHome() + filepath.substring(1);
    }

    if (!fs.existsSync(filepath)) {
        throw new Error("Invalid file path: file " + filepath + " does not exist");
    }
    var obj = ini.parse(fs.readFileSync(filepath, 'utf-8'));
    if (obj) {
        ensuresAllKeysAreLowercase(obj);
        var result = {};
        this.config = extend(true, result, this.config, obj);
    }
    return this.config;
};

module.exports.Loader = Loader;
