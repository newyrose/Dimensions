import PacketTypes from 'packettypes';
import {PacketFactory, ReadPacketFactory, hex2a} from 'utils';
import NPC from 'npc';
import Item from 'item';
import Client from 'client';
import Packet from 'packet';
import {Command} from 'clientcommandhandler';
import ClientStates from 'clientstates';
import Color from 'color';
import * as _ from 'lodash';
import {PacketHandlers} from 'extension';

class ClientPacketHandler {
  currentClient: Client;
  
  /* Checks whether the packet was handled by extensions prior to being processed by this class */
  runPriorHandlers(client: Client, packet: Packet): boolean {
    let handlers = client.globalHandlers.extensions;
    let handled = false;
    for (let key in handlers) {
      let handler = handlers[key];
      if (typeof handler.priorPacketHandlers !== 'undefined' && typeof handler.priorPacketHandlers.clientHandler !== 'undefined') {
        handled = handler.priorPacketHandlers.clientHandler.handlePacket(client, packet);
        if (handled) {
          break;
        }
      }
    }
    
    return handled;
  }
  
  /* Checks whether the packet was handled by extensions after being processed by this class */
  runPostHandlers(client: Client, packet: Packet): boolean {
    let handlers = client.globalHandlers.extensions;
    let handled = false;
    for (let key in handlers) {
      let handler = handlers[key];
      if (typeof handler.postPacketHandlers !== 'undefined' && typeof handler.postPacketHandlers.clientHandler !== 'undefined') {
        handled = handler.postPacketHandlers.clientHandler.handlePacket(client, packet);
        if (handled) {
          break;
        }
      }
    }
    
    return handled;
  }

  /* Runs the packet through extension handlers and runs any appropriate handlers of this class */
  handlePacket(client: Client, packet: Packet): string {
    let priorHandled: boolean = this.runPriorHandlers(client, packet);
    if (priorHandled) {
      return "";
    }
    
    let packetType: number = packet.packetType;
    let handled: boolean = false;

    // Set current client while we handle this packet
    this.currentClient = client;
    switch (packetType) {
      case PacketTypes.PlayerInfo:
        handled = this.handlePlayerInfo(packet);
        break;

      case PacketTypes.UpdatePlayerBuff:
        handled = this.handleUpdatePlayerBuff(packet);
        break;

      case PacketTypes.AddPlayerBuff:
        handled = this.handleAddPlayerBuff(packet);
        break;

      case PacketTypes.PlayerInventorySlot:
        handled = this.handlePlayerInventorySlot(packet);
        break;

      case PacketTypes.PlayerMana:
        handled = this.handlePlayerMana(packet);
        break;

      case PacketTypes.PlayerHP:
        handled = this.handlePlayerHP(packet);
        break;

      case PacketTypes.UpdateItemDrop:
        handled = this.handleUpdateItemDrop(packet);
        break;

      case PacketTypes.UpdateItemOwner:
        handled = this.handleUpdateItemOwner(packet);
        break;

      // Either will be sent, but not both
      case PacketTypes.ContinueConnecting2:
      case PacketTypes.Status:
        if (this.currentClient.state === ClientStates.FreshConnection) {
          // Finished sending inventory
          this.currentClient.state = ClientStates.FinishinedSendingInventory;
        }
        break;

      case PacketTypes.SpawnPlayer:
        handled = this.handleSpawnPlayer(packet);
        break;

      case PacketTypes.ChatMessage:
        handled = this.handleChatMessage(packet);
        break;

      case PacketTypes.DimensionsUpdate:
        // Client cannot send 67 (It's used by Dimensions to communicate special info)
        handled = true;
        break;

      case PacketTypes.ClientUUID:
        handled = this.handleClientUUID(packet);
        break;
    }
    
    if (handled) {
      return "";
    }
    
    let postHandled: boolean = this.runPostHandlers(client, packet);
    if (postHandled) {
      return "";
    }
    
    return packet.data;
  }

  /* Updates tracked visuals for player to restore them when they switch from
   * an SSC to a non-SSC server */
  handlePlayerInfo(packet: Packet): boolean {
    let nameLength: number = parseInt(packet.data.substr(12, 2), 16);
    let reader = new ReadPacketFactory(packet.data);
    reader.readByte(); // Player ID
    let skinVariant = reader.readByte();
    let hair = reader.readByte();
    if (hair > 134) {
      hair = 0;
    }
    let name = reader.readString();
    let hairDye = reader.readByte();
    let hideVisuals = reader.readByte();
    let hideVisuals2 = reader.readByte();
    let hideMisc = reader.readByte();
    let hairColor = reader.readColor();
    let skinColor = reader.readColor();
    let eyeColor = reader.readColor();
    let shirtColor = reader.readColor();
    let underShirtColor = reader.readColor();
    let pantsColor = reader.readColor();
    let shoeColor = reader.readColor();
    let difficulty = reader.readByte();

    let player = this.currentClient.player;
    if (player.allowedNameChange) {
      this.currentClient.setName(name);
    }

    if (player.allowedCharacterChange) {
      player.skinVariant = skinVariant;
      player.hair = hair;
      player.hairDye = hairDye;
      player.hideVisuals = hideVisuals;
      player.hideVisuals2 = hideVisuals2;
      player.hideMisc = hideMisc;
      player.hairColor = hairColor;
      player.skinColor = skinColor;
      player.eyeColor = eyeColor;
      player.shirtColor = shirtColor;
      player.underShirtColor = underShirtColor;
      player.pantsColor = pantsColor;
      player.shoeColor = shoeColor;
      player.difficulty = difficulty;
      player.allowedCharacterChange = false;
    }

    return false;
  }

  /* Used to prevent invisibility buff from being sent to the server
   * for used when the config is set to blockInvis = true */
  handleUpdatePlayerBuff(packet: Packet): boolean {
    let reader: ReadPacketFactory = new ReadPacketFactory(packet.data);
    let playerID: number = reader.readByte();
    
    if (this.currentClient.options.blockInvis) {
      var updatePlayerBuff: PacketFactory = (new PacketFactory())
        .setType(PacketTypes.UpdatePlayerBuff)
        .packByte(playerID);

      for (let i: number = 0; i < 22; i++) {
        if (reader.packetData.length !== 0) {
          let buffType: number = reader.readByte();
          if (buffType !== 10) {
            updatePlayerBuff.packByte(buffType);
          } else {
            updatePlayerBuff.packByte(0);
          }
        }
      }

      packet.data = updatePlayerBuff.data();
    }
    
    return false;
  }

  /* Used to prevent invisibility buff from being sent to the server
   * for used when the config is set to blockInvis = true */
  handleAddPlayerBuff(packet: Packet): boolean {
    let reader: ReadPacketFactory = new ReadPacketFactory(packet.data);
    let playerID: number = reader.readByte();
    let buffID: number = reader.readByte();

    if (this.currentClient.options.blockInvis) {
      return buffID === 10;
    } else {
      return false;
    }
  }

  /* Tracks the players inventory slots to restore them when they switch
   * from an SSC server to a Non-SSC server */
  handlePlayerInventorySlot(packet: Packet): boolean {
    if ((this.currentClient.state === ClientStates.FreshConnection || this.currentClient.state === ClientStates.ConnectionSwitchEstablished) && !this.currentClient.waitingCharacterRestore) {
      let reader: ReadPacketFactory = new ReadPacketFactory(packet.data);
      let playerID: number = reader.readByte();
      let slotID: number = reader.readByte();
      let stack: number = reader.readInt16();
      let prefix: number = reader.readByte();
      let netID: number = reader.readInt16();
      this.currentClient.player.inventory[slotID] = new Item(slotID, stack, prefix, netID);
    }

    return false;
  }

  /* Tracks the player mana to restore it when they switch from an
   * SSC server to a Non-SSC server */ 
  handlePlayerMana(packet: Packet): boolean {
    if (!this.currentClient.player.allowedManaChange)
      return false;

    // Read mana sent and then set the player object mana
    let reader: ReadPacketFactory = new ReadPacketFactory(packet.data);
    reader.readByte();
    reader.readInt16();
    let mana: number = reader.readInt16();
    this.currentClient.player.mana = mana;
    this.currentClient.player.allowedManaChange = false;

    return false;
  }

  /* Tracks the player HP to restore it when they switch from an
   * SSC server to a Non-SSC server */
  handlePlayerHP(packet: Packet): boolean {
    if (!this.currentClient.player.allowedLifeChange)
      return false;

    // Read life sent and then set the player object life
    let reader: ReadPacketFactory = new ReadPacketFactory(packet.data);
    reader.readByte();
    reader.readInt16();
    let life: number = reader.readInt16();
    this.currentClient.player.life = life;
    this.currentClient.player.allowedLifeChange = false;

    return false;
  }

  /* Prevents the player sending the item drop packet too early
   * which causes them to be kicked. It also adds it to the packet queue
   * so that it may be sent when the client has fully connected (and wont
   * get kicked for sending it) */
  handleUpdateItemDrop(packet: Packet): boolean {
    // Prevent this being sent too early (causing kicked for invalid operation)
    if (this.currentClient.state !== ClientStates.FullyConnected) {
      this.currentClient.packetQueue += packet.data;
      return true;
    }

    return false;
  }

  /* Prevents the player sending the item owner packet too early
   * which causes them to be kicked. It also adds it to the packet queue
   * so that it may be sent when the client has fully connected (and wont
   * get kicked for sending it) 
   * 
   * Note: This packet is important for tShock SSC to work. If this was
   *       prevented outright, SSC would be broken (inventory would be unchangable) */
  handleUpdateItemOwner(packet: Packet): boolean {
    // Prevent this being sent too early (causing kicked for invalid operation)
    if (this.currentClient.state !== ClientStates.FullyConnected) {
      this.currentClient.packetQueue += packet.data;
      return true;
    }

    return false;
  }

  /* When a player sends this, the clients packet queue is cleared. This may be
   * a problem if the player kills themself and respawns during Dimension changes,
   * which would cause the state to change incorrectly and waiting packets to be
   * sent too early. But the amount of time for this to happen would likely result,
   * in a disconnect from the client.
  */
  handleSpawnPlayer(packet: Packet): boolean {
    if (this.currentClient.state === ClientStates.FinishinedSendingInventory) {
        this.currentClient.state = ClientStates.FullyConnected;
    }
    
    this.currentClient.sendWaitingPackets();

    return false;
  }

  /* Handles any commands sent by the client given they start with "/" */
  handleChatMessage(packet: Packet): boolean {
    let handled: boolean = false;
    let chatMessage: string = hex2a(packet.data.substr(16));

    // If chat message is a command
    if (chatMessage.length > 1 && chatMessage.substr(0, 1) === "/") {
      let command: Command = this.currentClient.globalHandlers.command.parseCommand(chatMessage);
      handled = this.currentClient.globalHandlers.command.handle(command, this.currentClient);
    }

    return handled;
  }

  /* Updates the clients current tracked UUID */
  handleClientUUID(packet: Packet): boolean {
    let reader: ReadPacketFactory = new ReadPacketFactory(packet.data);
    this.currentClient.UUID = reader.readString();

    return false;
  }
}

export default ClientPacketHandler;