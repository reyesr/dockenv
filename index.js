var dockerlib = require("dockerlib"),
    cfg = require("./config-loader"),
    checker = require("./config-checker"),
    dockermgr = require("./docker-envmgr"),
    optimist = require("optimist"),
    fs =require("fs"),
    misc = require("./miscutils");

var configLoader = new cfg.Loader();

var cmdline_options = optimist
    .boolean("verbose").default("verbose", false).alias("v", "verbose")
    .usage("Usage: $0 config-file")
    ;

var options = cmdline_options.argv

if (options._.length != 1) {
    console.error("Error: Needs one and only one configuration file");
    process.exit(1);
}
var configurationFile = misc.interpolatePath(options._[0]);
if (!fs.existsSync(configurationFile)) {
    console.error("Error: Configuration file does not exist!");
    process.exit(2);
}

var defaultLocalFile = "$HOME/.dockenv.ini";
if (options.verbose && !fs.existsSync(defaultLocalFile)) {
    console.log("Warning: local file " + defaultLocalFile + " not found");
}
configLoader.load(defaultLocalFile);
var config = configLoader.load(configurationFile);

if (config["registry-user"] && config["registry-domain"]) {
    options.verbose && console.log("Login to " + config["registry-domain"] + " (user: " + config["registry-user"] + ")");
    try {
        dockerlib.docker.login(config["registry-user"], config["registry-domain"]);
    } catch (e) {
        console.error("Error: " + e.message);
        console.error("You need to be logged in to the registry " + config["registry-domain"]);
        process.exit(5);
    }
}

var manager = new dockermgr.DockerEnvironmentManager(config, options.verbose);
dockerlib.verbose = options.extraVerbose;

var checkResults = manager.verify();
if (options.verbose && checkResults.warnings.length>0) {
    checkResults.getWarningMessages().forEach(function(msg) {
        console.error("Warning: " + msg);
    });
}
if (checkResults.errors.length>0) {
    checkResults.getErrorMessages().forEach(function(msg) {
        console.error("Error: " + msg);
    });
    process.exit(3);
}

try {
    manager.install();
    console.log("Successfully installed " + configurationFile);
    process.exit(0);
} catch (e) {
    if (options.verbose) {
        throw e;
    } else {
        console.error(e.message);
    }
    console.log("Installation failed.");
    process.exit(99);
}