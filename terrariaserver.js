define(['utils', 'config', 'packettypes', 'underscore'], function(Utils, Config, PacketTypes, _) {
  var TerrariaServer = Class.extend({
    init: function(socket, client) {
      this.socket = socket;
      this.client = client;
      this.ip = null;
      this.port = null;
      this.name = "";
      this.spawn = {
        x: 0,
        y: 0
      };
      this.bufferPacket = "";
    },

    handleData: function(encodedData) {
      try {
        var self = this;
        var handled = false;
        var incompleteData = Utils.hex2str(encodedData);
        //console.log(entireData);

        if (this.bufferPacket.length > 0) {
          //console.log("Used bufferPacket");
        }
        var skip = false;

        // This is the incomplete packet carried over from last time
        var bufferPacket = this.bufferPacket;

        // The combined packet info using buffer
        var entireData = bufferPacket + incompleteData;

        // Get an array of packets from the entireData
        var entireDataInfo = Utils.getPacketsFromHexString(entireData);

        // Update buffer packet to the new incomplete packet (if any)
        this.bufferPacket = entireDataInfo.bufferPacket;

        // Inspect and handle each packet
        var packets = entireDataInfo.packets;
        _.each(packets, function(packet) {
          var data = packet.data;
          var packetType = packet.packetType;

          // Used for any sending we do manually
          var packetData;

          //console.log(self.ip + ":" + self.port + " Server Packet [" + packetType + "]: " + (PacketTypes[packetType]));
          if (!skip) {
            if (PacketTypes[packetType]) {
              //console.log(hex);
              if (packetType == 2) {
                handled = true;
                if (!self.client.ingame) {
                  self.client.socket.write(new Buffer(packet.data, 'hex'));
                  self.client.socket.destroy();
                } else {
                  var dcReason = Utils.hex2a(data.substr(8));
                  if (dcReason.length < 50) {
                    //self.socket.destroy();
                    //console.log(this);
                    var color = "C8FF00"; // shitty green
                    var message = "[Dimensional Alert]";
                    //console.log(entireData)
                    self.client.sendChatMessage(message, color);
                    self.client.sendChatMessage(dcReason, color);
                    self.client.wasKicked = true;
                    self.socket.destroy();
                    self.client.connected = false;
                  }
                }
              }
            }

            if (packetType === 3) {
              self.client.player.id = parseInt(data.substr(6, 2), 16);
              self.client.player.idHex = data.substr(6, 2);

              // Send IP Address
              var ip = Utils.getProperIP(self.client.socket.remoteAddress);
              packetData = Utils.PacketFactory()
                                .setType(67)
                                .packInt16(0)
                                .packString(ip)
                                .data();
              data = new Buffer(packetData, 'hex');
              self.socket.write(data);
            }

            var pT;
            var clientData;
            if (self.client.state === 2) {
              if (packetType === 7) {
                self.spawn.x = data.substr(26, 4);
                self.spawn.y = data.substr(28, 4);
                clientData = new Buffer("0b0008ffffffffffffffff", 'hex');
                self.socket.write(clientData);
                //console.log("Client Packet [8]: Get Section/Request Sync [By Relay]");
                //LogClientPacket(clientData);


                //setTimeout(function() {
                //  clientData = new Buffer("0e 00 41 04 " + self.playerID + " 00 98 83 47 00 40 7c 46", 'hex');
                //  self.client.socket.write(clientData);
                //}.bind(this), 5000);

                //clientData = new Buffer("00002cFF0000000100", 'hex');
                //self.socket.write(clientData);
                self.client.state = 3;
                self.client.tellSelfToClearPlayers();
                if (self.client.routingInformation !== null) {
                  packetData = Utils.PacketFactory()
                                        .setType(67)
                                        .packInt16(self.client.routingInformation.type)
                                        .packString(self.client.routingInformation.info)
                                        .data();
                  data = new Buffer(packetData, 'hex');
                  self.socket.write(data);
                  self.client.routingInformation = null;
                }
              }
            }

            if (packetType === 101 && self.client.state === 3) {
              self.client.state = 0;
              clientData = new Buffer("08000c" + self.client.player.idHex + self.spawn.x + self.spawn.y, 'hex');
              self.socket.write(clientData);
              //console.log("Client Packet [12]: Spawn Player [By Relay]");
              //console.log(self.ip + ":" + self.port + " Server Packet [12]: Spawn Player [By Relay]");

              //self.client.tellSelfToClearNPCs();
              setTimeout(function() {
                if (self.client && self.client.socket) {
                  self.socket.write(clientData);
                  self.client.socket.write(clientData);
                }
              }, 1000);
            }

            if (packetType === 101) {
              self.client.ingame = true;
            }

          }
        });

        if (!handled) {
          this.client.socket.write(encodedData);
        }
      } catch (e) {
        console.log("Handled Data Error: " + e);
      }
    },

    handleClose: function() {
      console.log("TerrariaServer socket closed. [" + this.name + "]");
      try {
        console.log("[" + this.name + ": " + this.client.serverCounts[this.name] + "]");
        if (this.client.countIncremented) {
          this.client.serverCounts[this.name]--;
          this.client.countIncremented = false;
        }
        console.log("[" + this.name + ": " + this.client.serverCounts[this.name] + "]");
      } catch (e) {
        console.log("handleClose Err: " + e);
      }

      var dimensionsList = "";
      var dimensionNames = _.keys(this.client.servers);
      for (var i = 0; i < dimensionNames.length; i++) {
        dimensionsList += (i > 0 ? ", " : " ") + "/" + dimensionNames[i];
      }

      if (!this.client.wasKicked) {
        this.client.sendChatMessage("The timeline you were in has collapsed.", "00BFFF");
        this.client.sendChatMessage("Specify a [c/FF00CC:Dimension] to travel to: " + dimensionsList, "00BFFF");
      } else {
        this.client.sendChatMessage("Specify a [c/FF00CC:Dimension] to travel to: " + dimensionsList, "00BFFF");
        this.client.wasKicked = false;
      }
    },

    handleError: function(error) {
      //console.log(this.ip + ":" + this.port + " " + this.name);
      //this.client.changeServer(Config.IP, Config.PORT);
      console.log("TerrariaServer Socket Error: " + error);
      this.socket.destroy();
      this.client.connected = false;
    }
  });

  return TerrariaServer;
});
