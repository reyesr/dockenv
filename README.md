# dockenv

dockenv reproducibly pulls and sets up containers using a configuration file.
It enforces correctness for its configuration file and for the set of containers by verifying that
no links or volumes are missing (among other things).

Note that dockenv does not build, its sole purpose is the deployment of a configuration of containers on
a host, typically on production, preproduction, or development environements. It assumes you already have
a build system that creates the images and pushes them on a public or private registry.

# Short summary

Feed dockenv with a simple configuration file (a somewhat classic ini):


    label=My Fine Application

    # optionally define a private registry
    registry-domain=my-registry.example.com
    registry-user=myself

    [mongo]
    image = example/mongo
    image-tag=v2
    volumes = $HOME/example/mongo/:/DATA
    priority=1

    [example-webapp]
    image = example/my-fine-webapp
    image-tag=20150105-bde8b6c-1.3.1-RC4
    volumes[]= $HOME/example/config:/CONFIG
    volumes[]= $HOME/example/logs:/logs
    links=mongo:mongo
    ports[]=80:80
    ports[]=443:443
    priority=2

This tells dockenv to do the following:

- Checks the correctness of the configuration files
- Pulls all the images:tag referenced in the configuration file
- Verifies the dependencies: links must target containers defined in the file, mountpoints must exists, etc.
- If everything is fine, proceed to removing any existing container, and install the new ones.

There are several advantages to using this kind of tool: a single configuration file can fully define
the set of containers expected to work together on a same host, along with their configuration and
image versions. In other words, just define a dockenv configuration, and use it to install on a
test environment, then on production: it's the same file, so it's hard to mess up.

# Typical workflow

Developers commit their Docker images to their repository (public or private), then create a dockenv.ini
configuration file. This one can be committed to your version control software, and used to reproducibly
proceed to the deployment on any environment.

# Installation

System-wide installation:

    sudo npm install -g git+https://github.com/reyesr/dockenv.git

Local installation (installs in the current directory):
    npm install git+https://github.com/reyesr/dockenv.git

For the local installation, the binary is located at ./node_modules/.bin/dockenv

# Usage

    Usage: dockenv [options] config-file

    Options:
      -v, --verbose     Verbose mode                       [default: false]
      --extra-verbose   Extra verbose mode (really!)       [default: false]
      -w, --warns       Treat warnings as errors           [default: false]
      -s, --stacktrace  Eventually display the stacktrace  [default: false]

For instance

    dockenv -v ./environment-3f90ef.ini 
    
will do the following:

- Search for a ~/.dockenv.ini file, and load it if it exists
- Load the ./environment-3f90ef.ini file. Overwrites any value defined in the in ~/.dockenv.ini.
- Ensure consistency of the configuration
- Display any warning detected
- Install this environment

# The Ini configuration files
 
The configuration file used by dockenv are standard ini file, with properties definitions.
The global section defines the parameters that are not specific to any container. Container definitions
are expected in their own section, typically named after the container.

Note that the property keys are not case-sensitive. During the verification step, unknown settings raise a warning (if the
-w/--warns options is set, it also stops the execution).

## Local configuration file

If a ~/.dockenv.ini file exists, dockenv tries to load it. All the properties defined in this file are used
as default values for the configuration file. It can contain definitions for the global settings, but also for
containers, in case you need to have a specific configuration for them (typically a mac address specific to the network
environment).

## Global settings

### label

A string displayed at the beginning of the execution. You can typically put there any meaningful information relative
to this environment. If the label property is not set, nothing is printed.

    label=Environment MyApp 1.3 for customer XXX

### pause

As of Docker 1.4.x, you may still experience issues such as #9665 #3968, which are basically race-condition errors
happening when a container is started immediatly after a container with the same name is removed. Adding a pause
prevent this issue to happen. The default value is 1000ms, but your mileage may vary, and you may need to set it
to 2 ou 3 seconds, or 500ms, or less. The value is expected to be an integer, in milliseconds.

    pause=1500
    
Once this issue is definitely fixed, you may want to set pause=0.

### exposing-containers-must-have-mac-address

Your environement may require you to have a specific mac address for all the IP configured on your host (typically
when there is a protection set up at the router level). If this is the case, this options forces dockenv to check
that all the containers exposing ports (ie. any container using the -p or -P option) to have a mac address defined
in the container configuration. The default is false. Most people won't need this option.

    exposing-containers-must-have-mac-address=true

### autocreate-volumes-mountpoints

When this option is enabled, dockenv automatically creates the host directories that are referenced in the --volume options
if they do not exist. Default value is 'false'. If this option is not enabled, and the host directory does not exist, 
an error is raised, and the environment installation is cancelled.

    autocreate-volumes-mountpoints=true
    
### registry-domain

If you use a private registry, you need to specify its domain. That's what this option is for. Image names defined 
by the containers are preprended with this domain. If a registry-domain is defined, dockenv tries to log in, but
that's only for verification purpose, you have to be already logged to this registry with your host user or it
will likely fail.

    registry-domain=registry.example.com

### registry-user
    
If you use a private registry, this options defines the user name to use for the log in.

    registry-user=my-user-name
    
## Container settings

Each section of the ini file defines a container. You need to define at least the image and image-tag properties.

### image

This name of the image used to create the container. Dockenv tries to pull all the image:image-tag of each containers before installing anything.
Mandatory.

    image=my-company/my-image

### image-tag

The tag (ie. the version for the image) defines which version of the image is pulled from the registry and used to
create the container.
Mandatory.

    image-tag=v1.2
    image-tag=latest
    image-tag=v1.2-20131209-97f2737

### name

By default, the name of the container is the name of the .ini section that defines the container settings. If you
want to use another name, you can use this property to override the default value.
Optional.

    name=real-name-of-my-container

### ports

Defines the ports that are exposed by this container, using the same form than the docker command line.

If multiple ports are defined, use the array notation.

    ports=127.0.0.1:80:80
or

    ports[]=80:80
    ports[]=443:443

### links

The linking definition for a container are set by this property. If you need to define multiple links, use the
array notation. Values are expected to be defined as for the docker --link option.

    links=mongo:mongo

or

    links[]=mailserver:postfix
    links[]=sqlserver:mysql

### volumes

This property defines the volumes for a container. For multiple volumes, use the array notation. Values are expected to be
of the same form as the -v option of docker. You can use '$HOME' and '~/' in the host part.


    volumes= /opt/example/config:/CONFIG
or

    volumes[]= $HOME/example/config:/CONFIG
    volumes[]= $HOME/example/logs:/logs

### mac-address

If this property is defined, the Docker 1.4 --mac-address is used to set up the mac address of the container.

    mac-address=00-B0-D0-86-BB-F7

### run-options

Use this property to add any option you need for the 'docker run' command. 

    run-options=--net=host --privileged -m 128m

### priority

This property defines the order of creation of the containers. Expects an integer value. Container with 
lower values are spawned first. This is important when you link containers, as it ensures the containers
are started with existing links in their /etc/hosts.

Containers with no priority defined are launched last. If no priority is defined at all, you can expect the 
containers to be launched in alphabetical order, which is probably wrong.

    priority=1

