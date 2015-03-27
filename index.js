var dockerlib = require("dockerlib"),
    cfg = require("./config-loader"),
    checker = require("./config-checker"),
    dockermgr = require("./docker-envmgr"),
    optimist = require("optimist"),
    fs =require("fs"),
    misc = require("./miscutils");

var packageJson = require("./package.json");

var cmdLineParser = optimist
        .option("v", { alias: "verbose", default: false, describe: "Verbose mode" }).boolean("v")
        .boolean("extra-verbose").option("extra-verbose", {describe:"Extra verbose mode (really!)", default: false})
        .option("w", { alias: "warns", default: false, describe: "Treat warnings as errors"}).boolean("w")
        .option("s", { alias: "stacktrace", default: false, describe: "Eventually display the stacktrace"}).boolean("s")
        .boolean("no-pulling").option("no-pulling", { alias: "P", default: false, describe: "Disable the image pulling step"}).boolean("s")
        .check(function(argv) {
            if (argv._.length != 1) {
                throw new Error("Expecting one argument");
            }
        })
        .check(function(argv) {
            if (!fs.existsSync(argv._[0])) {
                throw new Error("Configuration file '"+argv._[0]+"' does not exist");
            }
        })
        .usage("Usage: $0 [options] config-file\nInstalled version " + packageJson.version);
    ;
var options = cmdLineParser.argv

process.on('uncaughtException', function (err) {
    console.error((typeof err.message == "string" && err.message.substr(0,5).toLowerCase()!="error"?"Error: ":"") + (err.message?err.message:"something unexpected happend"));
    if (options.stacktrace) {
        console.error(err.stack);
    }
    console.log("Installation failed.");
    process.exit(99);
});

var configurationFile = options._[0];

var defaultLocalFile = misc.interpolatePath("$HOME/.dockenv.ini");

var configLoader = new cfg.Loader();
var config = configLoader.load(configurationFile);

if (fs.existsSync(defaultLocalFile)) {
    console.log("Using configuration file '" + defaultLocalFile + "' for local settings.");
    config = configLoader.load(defaultLocalFile);
}

if (config.label) {
    console.log("Environment: " + config.label);
}

var manager = new dockermgr.DockerEnvironmentManager(config, options);
dockerlib.verbose = options["extra-verbose"]
manager.logIn();

var checkResults =  manager.checked; // manager.verify();
if ((options.verbose || options.warns) && checkResults.warnings.length>0) {
    checkResults.getWarningMessages().forEach(function(msg) {
        console.error("Warning: " + msg);
    });
}
if (checkResults.errors.length>0) {
    checkResults.getErrorMessages().forEach(function(msg) {
        console.error("Error: " + msg);
    });
}
if (checkResults.errors.length>0 || (options.warns && checkResults.warnings.length>0)) {
    throw new Error("Errors were found in the configuration file.");
}

manager.install(function(err) {
    if (!err) {
        console.log("Successfully installed " + configurationFile);
        process.exit(0);
    } else {
        console.log("Installation failed for " + configurationFile + ((err && err.toString)?" (" + err.toString()  +")":""));
        if (options.stacktrace && err && err.stack) {
            console.error(err.stack);
        }
        process.exit(1);
    }
});
