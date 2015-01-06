dockenv
=======

dockenv reproducibly pulls and sets up containers using a configuration file.

Short summary
=============

Feed dockenv with a simple configuration file (a classic ini):


    label=My Fine Application

    # optionnally define a private registry
    registry-domain=my-registry.example.com
    registry-user=myself

    [mongo]
    image = example/mongo
    image-tag=v2
    volumes = $HOME/example/mongo/:/DATA

    [example-webapp]
    image = example/my-fine-webapp
    image-tag=20150105-bde8b6c-1.3.1-RC4
    volumes[]= $HOME/example/config:/CONFIG
    volumes[]= $HOME/example/logs:/logs
    links[]=mongo:mongo

This tells dockenv to do the following:

- Checks the correctness of the configuration files
- Pulls all the images:tag referenced in the configuration file
- Verifies the dependencies: links must target containers defined in the file, mountpoints must exists, etc.
- If everything is fine, proceed to removing any existing container, and install the new ones.

There are several advantages to using this kind of tool: a single configuration file can fully define
the set of containers expected to work together on a same host, along with their configuration and
image versions. In other words, just define a dockenv configuration, and use it to install on a
test environment, then on production: it's the same file, so it's hard to mess up.

Typical workflow
================

Developers commit their Docker images to their repository (public or private), then create a dockenv.ini
configuration file. This one can be committed to your version control software, and used to reproducibly
proceed to the deployment on any environment.

Installation
============

System-wide installation:

    sudo npm install -g git+https://github.com/reyesr/dockenv.git

Local installation (installs in the current directory):
    npm install git+https://github.com/reyesr/dockenv.git

For the local installation, the binary is located at ./node_modules/.bin/dockenv

Usage
=====

dockenv [-v] CONFIG-FILE

