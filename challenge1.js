/* Challenge: http://challenge2.airtime.com:7182/
 * Solution Author: Devin Goodsell
 * Date: 01/08/2014
 *
 * You are a maintenance worker of a cyberspace labyrinth, tasked with creating a report of all the rooms in the labyrinth where the lights are no longer functional.  The labyrinth has the following HTTP Interface:
 * (all requests must contain the header X-Labyrinth-Email: <your email address>)

 * GET /start
 * // This tells you the room that you start in.
 * returns {
 * roomId: '<roomId of first room>'
 * ;

 * GET /exits?roomId=<roomId>
 * // This allows you to see which exits are available for this current room.
 * returns {
 *   exits: ['north', 'south', 'east', 'west']
 * }

 * GET /move?roomId=<roomId>&exit=<exit>
 * // This allows you to see what the roomId is through an exit.
 * returns {
 *   roomId: '<roomId of room connected by exit>'
 * }

 * GET /wall?roomId=<roomId>
 * // This allows you to see what the writing is on the wall for a particular room if the lights are working.
 * returns {
 *   writing: '<string>'
 *   order: <number>
 * }

 * // If the lights aren't working
 * returns {
 *   writing: 'xx'
 *   order: -1
 * }

 * POST /report
 * // Submit your maintenance report to the mothership. Because the mothership knows that some workers are lazy and untruthful, the mothership requires a challenge code that is made by concatenating all the 'writing' on the walls in lit rooms, in the order designated by 'order' from lowest to greatest.

 * body {
 *   roomIds: [array of room ids whose lights were broken],
 *   challenge: 'challenge code'
 * }

 * Note the /report expects a JSON-formatted post body.
 * The next steps will be apparent once the mothership approves your maintenance report.
 * Hint: If you get a 404, you probably are doing something wrong.
 */
/* jslint node:true, esnext:true */
"use strict";

const
  BASE_URL = 'http://challenge2.airtime.com:7182/',
  GET_START_URL = BASE_URL + 'start',
  GET_ROOM_EXITS_URL = BASE_URL + 'exits?roomId=<roomId>',
  GET_ROOM_INFO_URL = BASE_URL + 'wall?roomId=<roomId>',
  MOVE_ROOM_URL = BASE_URL + 'move?roomId=<roomId>&exit=<exit>',
  REPORT_URL = BASE_URL + '/report',
  HTTP_HEADERS = { 'X-Labyrinth-Email' : 'devingoodsell@gmail.com' }
;

var
  _ = require('underscore'),
  unirest = require('unirest'),
  async = require('async'),
  // Used for quick determination if the room was already visisted.
  roomsVisited = {},
  // Used to collect information about all the rooms visited.
  roomsLog = [],

  /*
   * Used to find out information about the room and if possible
   * find out about all rooms related to this room if they haven't already
   * been visited.
   * Returns: callback(err)
   */
  searchRooms = function(roomId, callback) {
    if (roomsVisited[roomId] !== undefined) {
      return callback(null);
    }

    getRoomInfo(roomId, function(err, room) {
      if (err)
        return callback(err);

      roomsVisited[roomId] = room.lightsBroken;
      roomsLog.push(room);

      if (room.exits === null || room.exits.length === 0)
        return callback(null);

      // Using async to execute other rooms and manage return.
      async.each(room.exits, function(exit, callback) {
        getNextRoom(roomId, exit, function(err, nextRoom) {
          if (err)
            return callback(err);

          // Recursive step to search the next room if not already visited.
          searchRooms(nextRoom.roomId, callback);
        });
      },
      function(err) {
        return callback(err);
      });
    });
  },

  /*
   * Gets the first room to start in.
   * Returns callback(err, {roomId: string})
   */
  getStartRoom = function(callback) {
    unirest.get(GET_START_URL)
    .headers(HTTP_HEADERS)
    .send()
    .end(function(response) {
      try {
        return callback(response.error, JSON.parse(response.body));
      } catch(e) {
        return callback({responseBody: response.body, error: e});
      }
    });
  },

  /*
   * Gets the information about the room.
   * Returns callback(err, {
   *   roomId: string,
   *   writing: string,
   *   writingOrder: string,
   *   lightsBroken: bool,
   *   exists: string[]
   * })
   */
  getRoomInfo = function(roomId, callback) {
    var
      roomData = null,
      result = {
        roomId: roomId,
        writing: null,
        writingOrder: null,
        lightsBroken : false,
        exits: []
      }
    ;

    // Record the room and the status
    unirest.get(formatRequestUri(GET_ROOM_INFO_URL, roomId))
    .headers(HTTP_HEADERS)
    .send()
    .end(function(response) {
      if (response.error)
        return callback(response.error);

      try {
        roomData = JSON.parse(response.body);
      } catch (e) {
        return callback({responseBody: response.body, error: e});
      }

      if (roomData.order === -1) {
        result.lightsBroken = true;
      } else {
        result.writingOrder = roomData.order;
        result.writing = roomData.writing;
      }

      unirest.get(formatRequestUri(GET_ROOM_EXITS_URL, roomId))
      .headers(HTTP_HEADERS)
      .send()
      .end(function(response) {
        if (response.error)
          return callback(response.error);

        try {
          roomData = JSON.parse(response.body);
        } catch (e) {
          return callback({responseBody: response.body, error: e});
        }

        result.exits = roomData.exits;
        return callback(null, result);
      });
    });
  },

  /*
   * Gets the id of the next room based on the room id and direction of the next room.
   * Returns callback(err, {roomId: string})
   */
  getNextRoom = function(roomId, exit, callback) {
    unirest.get(formatRequestUri(MOVE_ROOM_URL, roomId, exit))
    .headers(HTTP_HEADERS)
    .send()
    .end(function(response) {
      try {
        return callback(response.error, JSON.parse(response.body));
      } catch(e) {
        return callback({responseBody: response.body, error: e});
      }
    });
  },

  /*
   * Sends the report and if successful returns an empty callback.
   * Returns: callback(err)
   */
  report = function(reportData, callback) {
    unirest.post(REPORT_URL)
    .headers(HTTP_HEADERS)
    .send(reportData)
    .end(function(response) {
      return callback(response.errors);
    });
  },

  /*
   * Formats a request uri to include roomId and exit* parameters *if available.
   * Returns: string
   */
  formatRequestUri = function(relativeUrl, roomId, exit) {
   return exit ?
      relativeUrl.replace(/<roomId>/i, roomId).replace(/<exit>/i, exit) :
      relativeUrl.replace(/<roomId>/i, roomId);
  },

  /*
   * Generates a challenge code based on the room array provided.
   * Returns: string
   */
  generateChallengeCode = function(rooms) {
    var sorted = _.sortBy(rooms, function(room) {
      return room.writingOrder;
    });

    return _.pluck(sorted, 'writing').join('');
  },

  /*
   * Generates a report based on the room information collected.
   * Returns {
   *   roomIds: string[],
   *   challenge: string
   * }
   */
  generateReport = function(rooms) {
    var brokenRooms = _.filter(rooms, function(room) { return room.lightsBroken; });

    return {
      roomIds: _.pluck(brokenRooms, 'roomId'),
      challenge: generateChallengeCode(rooms)
    };
  }
;

// Run the app
getStartRoom(function(err, room) {
  searchRooms(room.roomId, function(err) {
    if (err)
      return console.log("Found Error: ", err);

    var report = generateReport(roomsLog);
    console.log(report);
  });
});