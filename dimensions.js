define(['redis', 'listenserver', 'config', 'client', 'utils', 'interface', 'underscore', 'clientcommandhandler'],
  function(redis, ListenServer, Config, Client, Utils, Interface, _, ClientCommandHandler) {
    var Dimensions = Class.extend({
      init: function(nativeRequire) {
        var self = this;
        self.id = 0;
        self.nativeRequire = nativeRequire;
        self.servers = {};
        self.listenServers = {};
        self.serverCounts = {};
        self.handlers = {
          command: new ClientCommandHandler()
        };

        self.redisClient = redis.createClient();
        self.redisClient.subscribe('dimensions_cli');
        self.redisClient.on('message', function(channel, message) {
          if (channel === "dimensions_cli") {
            self.handleCommand(message);
          }
        });
        self.redisClient.on('error', function(err) {
          console.log("RedisError: "+err);
        });


        //self.interface = new Interface(self.handleCommand.bind(self));

        var listenKey;
        for (var i = 0; i < Config.servers.length; i++) {
          listenKey = Config.servers[i].listenPort;
          self.listenServers[listenKey] = new ListenServer(Config.servers[i], self.serverCounts, self.handlers, self.servers);

          for (var j = 0; j < Config.servers[i].routingServers.length; j++) {
            self.servers[Config.servers[i].routingServers[j].name] = Config.servers[i].routingServers[j];
          }
        }

        /*setInterval(function() {
          self.printServerCounts();
        }, 5000);*/
      },

      printServerCounts: function() {
        var self = this;
        var serverKeys = _.keys(self.servers);
        var info = "";
        for (var i = 0; i < serverKeys.length; i++) {
          info += "[" + serverKeys[i] + ": " + self.serverCounts[serverKeys[i]] + "] ";
        }
        console.log(info);
      },

      handleCommand: function(cmd) {
        var self = this;
        switch (cmd) {
          case "players":
            self.printServerCounts();
            break;
          case "reload":
            try {
              Config = Utils.requireNoCache('./config.js', self.nativeRequire);
            } catch (e) {
              console.log("Error loading config: " + e);
            }

            var currentRoster = {};
            var runAfterFinished = [];
            for (var i = 0; i < Config.servers.length; i++) {
              listenKey = Config.servers[i].listenPort;
              if (self.listenServers[listenKey]) {
                self.listenServers[listenKey].updateInfo(Config.servers[i]);
                for (var j = 0; j < Config.servers[i].routingServers.length; j++) {
                  self.servers[Config.servers[i].routingServers[j].name] = Config.servers[i].routingServers[j];
                }
              } else {
                runAfterFinished.push({
                  key: listenKey,
                  index: i
                });
              }

              currentRoster[listenKey] = 1;
            }

            var currentListenServers = _.keys(self.listenServers);
            for (var i = 0; i < currentListenServers.length; i++) {
              if (!currentRoster[currentListenServers[i]]) {
                // Close down
                self.listenServers[currentListenServers[i]].shutdown();
                delete self.listenServers[currentListenServers[i]];
              }
            }

            for (var i = 0; i < runAfterFinished.length; i++) {
              var serversIndex = runAfterFinished[i].index;
              self.listenServers[runAfterFinished[i].key] = new ListenServer(Config.servers[serversIndex], self.serverCounts, self.handlers, self.servers);
              for (var j = 0; j < Config.servers[serversIndex].routingServers.length; j++) {
                self.servers[Config.servers[serversIndex].routingServers[j].name] = Config.servers[serversIndex].routingServers[j];
              }
            }
            console.log("\033[33mReloaded Config.\033[37m");
            break;
          case "reloadcmds":
            try {
              var ClientCommandHandler = Utils.requireNoCache('./clientcommandhandler.js', self.nativeRequire);
              self.handlers.command = new ClientCommandHandler();
            } catch (e) {
              console.log("Error loading Command Handler: " + e);
            }
            console.log("\033[33mReloaded Command Handler.\033[37m");
            break;
        }
      }
    });

    return Dimensions;
  });
