var checker = require("./config-checker"),
    dockerlib = require("dockerlib"),
    extend = require("extend"),
    mkdirp = require("mkdirp"),
    fs = require("fs"),
    misc = require("./miscutils"),
    async = require("async");

var constraints  = new checker.ConfigChecker();
constraints.addGlobalSection("exposedPortNeedMacAddress", []);

var ENTRY_NAMES = {
    LABEL: "label",
    PAUSE: "pause",
    EXPOSED_PORT_NEED_MAC_ADDRESS: "exposing-containers-must-have-mac-address",
    AUTOCREATE_VOLUME_MOUNTPOINTS: "autocreate-volumes-mountpoints",
    REGISTRY_DOMAIN: "registry-domain",
    REGISTRY_USER: "registry-user",
    
    CONTAINER_IMAGE: "image",
    CONTAINER_IMAGE_TAG: "image-tag",
    CONTAINER_NAME: "name",
    CONTAINER_PORTS: "ports",
    CONTAINER_LINKS: "links",
    CONTAINER_VOLUMES: "volumes",
    CONTAINER_MAC_ADDRESS: "mac-address",
    CONTAINER_RUN_OPTIONS: "run-options",
    CONTAINER_PRIORITY: "priority"
};

constraints
    .addGlobalSection(ENTRY_NAMES.LABEL, [checker.ConstraintEnum.OPTIONAL])
    .addGlobalSection(ENTRY_NAMES.PAUSE, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.INTEGER])
    .addGlobalSection(ENTRY_NAMES.EXPOSED_PORT_NEED_MAC_ADDRESS, [checker.ConstraintEnum.OPTIONAL])
    .addGlobalSection(ENTRY_NAMES.AUTOCREATE_VOLUME_MOUNTPOINTS, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.BOOLEAN])
    .addGlobalSection(ENTRY_NAMES.REGISTRY_DOMAIN, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.STRING])
    .addGlobalSection(ENTRY_NAMES.REGISTRY_USER, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.STRING])
    
    .addSubSections(ENTRY_NAMES.CONTAINER_IMAGE, [checker.ConstraintEnum.MANDATORY, checker.ConstraintEnum.TYPE.STRING ])
    .addSubSections(ENTRY_NAMES.CONTAINER_IMAGE_TAG, [checker.ConstraintEnum.MANDATORY, checker.ConstraintEnum.TYPE.STRING ])
    .addSubSections(ENTRY_NAMES.CONTAINER_NAME, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.STRING ])
    .addSubSections(ENTRY_NAMES.CONTAINER_PORTS, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.ARRAY])
    .addSubSections(ENTRY_NAMES.CONTAINER_LINKS, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.ARRAY])
    .addSubSections(ENTRY_NAMES.CONTAINER_VOLUMES, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.ARRAY])
    .addSubSections(ENTRY_NAMES.CONTAINER_MAC_ADDRESS, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.STRING])
    .addSubSections(ENTRY_NAMES.CONTAINER_RUN_OPTIONS, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.ARRAY])
    .addSubSections(ENTRY_NAMES.CONTAINER_PRIORITY, [checker.ConstraintEnum.OPTIONAL, checker.ConstraintEnum.TYPE.INTEGER])
    ;

var MAC_ADDRESS_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

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
    this.image = config[ENTRY_NAMES.CONTAINER_IMAGE];
    this.imageTag = config[ENTRY_NAMES.CONTAINER_IMAGE_TAG];
    this.name = config[ENTRY_NAMES.CONTAINER_NAME] || defaultName;
    this.links = misc.toArray(config[ENTRY_NAMES.CONTAINER_LINKS]).map(function(desc) { return new Link(desc); })
    this.ports = misc.toArray(config[ENTRY_NAMES.CONTAINER_PORTS]).map(function(desc) { return new Port(desc); });
    this.volumes = misc.toArray(config[ENTRY_NAMES.CONTAINER_VOLUMES]).map(function(desc) { return new Volume(desc);});
    this.macAddress = config[ENTRY_NAMES.CONTAINER_MAC_ADDRESS];
    this.runOptions = misc.toArray(config[ENTRY_NAMES.CONTAINER_RUN_OPTIONS]);
    this.priority = config[ENTRY_NAMES.CONTAINER_PRIORITY];
}

Container.prototype.getNetConfiguration = function() {
    var net_re = /--net=([a-zA-Z\-0-9]+)/;
    for (var i=0; i<this.runOptions.length; i+=1) {
        var result = net_re.exec(this.runOptions[0]); 
        if (result) {
            return result[1];
        }
    }
};

Container.prototype.removeContainer = function(callback) {
    try {
        dockerlib.docker.removeContainer(this.name);
        callback(null);
    } catch (err) {
        console.error("Warning: container " + this.name + " could not be removed (does it exist?)");
        callback(null); // this always happens the first time a container is started, so we consider it safe
    }
};

Container.prototype.startContainer = function(imageRef, verbose, callback) {
    try {
        var ports = this.ports.map(function (portObj) {
            return portObj.toString();
        });
        var links = this.links.map(function (linkObj) {
            return linkObj.toString();
        });
        var volumes = this.volumes.map(function (volumeObj) {
            return volumeObj.toString();
        });
        verbose && console.log("Starting container " + this.name + " from " + imageRef);
        var options = this.runOptions.join(" ");
        if (this.macAddress) {
            options += " --mac-address=" + this.macAddress;
        }

        dockerlib.docker.runDaemon(this.name, imageRef, this.imageTag, ports, links, volumes, options);
        verbose && console.log("Started successfully container [" + this.name + "] from " + this.image + ":" + this.imageTag);
        
        callback(null);
    } catch (err) {
        callback(err);
    }
};

/**
 * Installation is the sequence of following events:
 * - Pull the image:version
 *
 * @param containerName
 * @param containerConfig
 * @param globalConfig
 */

function Manager(config, verbose) {
    this.config = config = extend(true, {}, config);
    this.checked = constraints.verify(this.config);
    this.verbose = !!verbose;
    this.containers =  misc.extractConfigSectionNames(config).map(function(sectionName) {
        return new Container(config[sectionName], sectionName);
    });
    this.containers.sort(function(a,b){
        if (a.priority === undefined) {
            return 1;
        } else if (b.priority == undefined) {
            return -1;
        } else {
            return a.priority-b.priority;
        }
    });
}

Manager.prototype.findContainer = function(name) {
    
    var filtered = this.containers.filter(function(cont) {
        return cont.name == name;
    });
    return filtered.shift();
};

Manager.prototype.getImageReference = function (image) {
    var url = this.config["registry-domain"] || "";
    if (url.length>0 && url[url.length-1] != '/') {
        url += "/";
    }
    return url + image;
};

Manager.prototype.logIn = function() {
    if (this.config[ENTRY_NAMES.REGISTRY_USER] && this.config[ENTRY_NAMES.REGISTRY_DOMAIN]) {
        this.verbose && console.log("Login to " + this.config[ENTRY_NAMES.REGISTRY_DOMAIN] + " (user: " + this.config[ENTRY_NAMES.REGISTRY_USER] + ")");
        try {
            dockerlib.docker.login(this.config[ENTRY_NAMES.REGISTRY_USER], this.config[ENTRY_NAMES.REGISTRY_DOMAIN]);
        } catch (e) {
            throw new Error("Failed to log in to the registry. Please check the configuration and ensure you are already logged in.");
        }
    }
};

Manager.prototype.checkInstallation = function() {
    var errors = [];
    var self = this;
    
    // Check that every mountpoint exists. Create it if required by the configuration.
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
    
    // Check if mac addresses need to be defined
    if (self.config[ENTRY_NAMES.EXPOSED_PORT_NEED_MAC_ADDRESS] == true) { // use type coercition, because it's safer to have a false positive than a false negative
        this.containers.forEach(function(container) {
            if (container.ports.length>0) {
                if (!container.macAddress) {
                    errors.push("MAC Address is not defined for the container [" + container.name + "] (there should be one, as per the " + ENTRY_NAMES.EXPOSED_PORT_NEED_MAC_ADDRESS + " property)");
                } else if ((!typeof container.macAddress == "string") || !MAC_ADDRESS_REGEX.test(container.macAddress)) {
                    errors.push("Could not recognize a valid MAC address for container [" + container.name + "] (found " + container.macAddress + ", expecting format 12:34:56:78:9A:BC)");
                }
            }
        });
    }
    
    // check if a container has a wrong linking
    this.containers.forEach(function(container) {
        var currentName = container.name;
        container.links.forEach(function(link) {
            var linkedContainer = self.findContainer(link.container);
            if (!linkedContainer) {
                errors.push("Unknown container " + link.container + " linked by " + currentName);
            } else if (linkedContainer.getNetConfiguration() == "host") {
                errors.push("Container " + link.container + " is using the host network stack, and cannot " +
                "be linked by " + currentName);
            }
        });
    });

    this.containers.forEach(function(container) {
        if (container.macAddress && container.getNetConfiguration() == "host") {
            errors.push("Can't set mac-address on [" + container.name + "] with --net=host");
        }
    });

    
    return errors;
};

Manager.prototype.install = function(callback) {
    
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
        self.verbose &&console.log("Pulling image " + imageRef);
        dockerlib.docker.pull(imageRef, container.imageTag);
    });
    
    var pause = this.config[ENTRY_NAMES.PAUSE]!==undefined?this.config[ENTRY_NAMES.PAUSE]:1000; // not sure about this default value
    var tasks = [];
    this.containers.forEach(function(container) {
        var imageRef = self.getImageReference(container.image);
        tasks.push(container.removeContainer.bind(container));
        tasks.push(function(callback){ setTimeout(callback, pause); });
        tasks.push(container.startContainer.bind(container, imageRef, self.verbose));
    });
    
    async.waterfall(tasks, callback);
};

module.exports.DockerEnvironmentManager = Manager;
