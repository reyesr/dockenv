var checker = require("./config-checker"),
    dockerlib = require("dockerlib"),
    mkdirp = require("mkdirp"),
    fs = require("fs"),
    misc = require("./miscutils");

var constraints  = new checker.ConfigChecker();
constraints.addGlobalSection("exposedPortNeedMacAddress", []);

constraints.addGlobalSection("exposedPortNeedMacAddress", [checker.ConstraintEnum.OPTIONAL])
    .addGlobalSection("registry-url", [checker.ConstraintEnum.OPTIONAL])
    .addGlobalSection("autocreate-volumes-mountpoints", [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.BOOLEAN])
    .addGlobalSection("registry-domain", [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.STRING])
    .addGlobalSection("registry-user", [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.STRING])
    .addSubSections("image", [checker.ConstraintEnum.MANDATORY, checker.ConstraintEnum.TYPE.STRING ])
    .addSubSections("image-tag", [checker.ConstraintEnum.MANDATORY, checker.ConstraintEnum.TYPE.STRING ])
    .addSubSections("name", [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.STRING ])
    .addSubSections("ports", [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.ARRAY])
    .addSubSections("links", [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.ARRAY])
    .addSubSections("volumes", [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.ARRAY])
    .addSubSections("mac-address", [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.STRING]);

function Link(descriptor) {
    if (!(this instanceof  Link)) {
        return new Link(descriptor);
    }

    var split = descriptor.split(":");
    if (split.length != 2) {
        throw new Error("Wrong link descriptor " + descriptor);
    }
    this.container = split[0];
    this.alias = split[1];
}
Link.prototype.toString = function() {
    return this.container + ":" + this.alias;
}

function Port(descriptor) {
    if (!(this instanceof  Port)) {
        return new Port(descriptor);
    }
    var split = descriptor.split(":");
    if (split.length < 2 || split.length>3) {
        throw new Error("Wrong port descriptor " + descriptor);
    }
    this.ip = split[0];
    this.hostPort = split.length==3?split[1]:undefined;
    this.containerPort = split.length==3?split[2]:split[1];
}
Port.prototype.toString = function() {
    return (this.hostPort?this.hostPort+":" : "") + this.ip + ":" + this.containerPort;
}

function Volume(descriptor) {
    if (!(this instanceof  Volume)) {
        return new Volume(descriptor);
    }
    var split = descriptor.split(":");
    if (split.length < 2 || split.length>3) {
        throw new Error("Wrong volume descriptor " + descriptor);
    }
    this.volumePath = (split.length == 1) ? split[0]:split[1];
    this.hostMountPoint = (split.length == 2) ? split[0]:undefined;
    if (this.hostMountPoint) {
        this.hostMountPoint = misc.interpolatePath(this.hostMountPoint);
    }
}

Volume.prototype.toString = function() {
    return (this.hostMountPoint?this.hostMountPoint+":" : "") + this.volumePath;
}

function Container(config, defaultName) {
    this.image = config.image;
    this.imageTag = config["image-tag"];
    this.name = config.name || defaultName;
    this.links = misc.toArray(config.links).map(function(desc) { return new Link(desc); })
    this.ports = misc.toArray(config.ports).map(function(desc) { return new Port(desc); });
    this.volumes = misc.toArray(config.volumes).map(function(desc) { return new Volume(desc);});
    this.macAddress = config["mac-address"];
    this.runOptions = config["run-options"];
}


/**
 * Installation is the sequence of following events:
 * - Pull the image:version
 *
 * @param containerName
 * @param containerConfig
 * @param globalConfig
 */

function Manager(config, verbose) {
    this.config = config;
    this.verbose = !!verbose;
    this.containers =  misc.extractConfigSectionNames(config).map(function(sectionName) {
        return new Container(config[sectionName], sectionName);
    });
}

Manager.prototype.getImageReference = function (image) {
    var url = this.config["registry-domain"] || "";
    if (url.length>0 && url[url.length-1] != '/') {
        url += "/";
    }
    return url + image;
};

Manager.prototype.verify = function() {
    return constraints.verify(this.config);
}

Manager.prototype.checkInstallation = function() {
    var errors = [];
    var self = this;
    this.containers.forEach(function(container) {
        container.volumes.forEach(function(volumeObject) {
            if (fs.existsSync(volumeObject.hostMountPoint) == false) {
                if (self.config["autocreate-volumes-mountpoints"] === true) {
                    mkdirp.sync(volumeObject.hostMountPoint);
                } else {
                    errors.push("Host mountpoint " + volumeObject.hostMountPoint + " for " + container.name + " does not exist");
                }
            }
        });
    });
    return errors;
};

Manager.prototype.install = function() {

    var errors = this.checkInstallation();
    if (errors.length>0) {
        errors.forEach(function(err) {
            console.error(err);
        });
        throw new Error(errors.length + " configuration error(s) were found.");
    }

    var self = this;
    // First step: we pull all the images
    this.containers.forEach(function(container) {
        var imageRef = self.getImageReference(container.image);
        if (self.verbose) {
            console.log("Pulling image " + imageRef);
        }
        dockerlib.docker.pull(imageRef, container.imageTag);
    });

    // then we kill and start each of the containers
    this.containers.forEach(function(container) {
        var imageRef = self.getImageReference(container.image);
        try {
            self.verbose && console.log("Removing previous container " + container.name);
            dockerlib.docker.removeContainer(container.name);
        } catch (e) {
            // ignore if the container was not found
            console.error("Warning: container " + container.name + " could not be removed (does it exist?)");
        }
        var ports = container.ports.map(function(portObj) { return portObj.toString();});
        var links = container.links.map(function(linkObj) { return linkObj.toString();});
        var volumes = container.volumes.map(function(volumeObj) { return volumeObj.toString();});
        self.verbose && console.log("Starting container " + container.name + " from " + imageRef);
        dockerlib.docker.runDaemon(container.name, imageRef, container.imageTag, ports, links, volumes, container.runOptions);
        this.verbose && console.log("Started successfully container [" + container.name + "] from " + container.image + ":" + container.imageTag);
    });
}

module.exports.DockerEnvironmentManager = Manager;
