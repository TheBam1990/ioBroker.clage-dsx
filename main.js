"use strict";

/*
 * Created with @iobroker/create-adapter v1.33.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
var https = require('https');
const utils = require("@iobroker/adapter-core");
const axios = require('axios').default;
const states = require(`${__dirname}/lib/states.js`); // Load attribute library
let devicesin;	//hilsvariable ob daten eingetragen sind oder nicht
let das; //hilfsvariable für this.
const generatedArray = [];	//erstelltes Array 
const objektarry = [];
let getAllZonesURL;	//vollständige adresse für get all zone
let serverUrl;
let benutzer;
let password;
let time;
let time1;
let time2;
// Load your modules here, e.g.:
// const fs = require("fs");

class ClageDsx extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "clage-dsx",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
		das=this;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

		// Initialize your adapter here
		serverUrl = this.config.adresse;
        benutzer = this.config.port;
        password = this.config.apiKey;
		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		await this.setStateAsync('info.connection', {val: false, ack: true});
		this.subscribeStates('*');

		if (serverUrl !== "" && benutzer !== "" && password !== "") {		//abfrage ob IP eingetragen ist
			devicesin=true;						//Variable setzen wenn adresse eingetragen ist
			await this.setStateAsync("info.connection", { val: true, ack: true });
			//this.log.info("IP adresse: " + serverUrl);
			getAllZonesURL= "https://"+serverUrl+"/devices"; 
			this.getHttpData(getAllZonesURL);
		} else {
			devicesin=false;
			//this.log.info("http anfrage fehlgeschlagen");
			await this.setStateAsync('info.connection', {val: false, ack: true});
			return;
		}

		
		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		if (devicesin === true) {
		time=setTimeout(function(){ das.readchanges(); }, 3000);
		}
		
		
		/*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		//*await this.setStateAsync("testVariable", true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		//*await this.setStateAsync("testVariable", { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		//*await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		//let result = await this.checkPasswordAsync("admin", "iobroker");
		//this.log.info("check user admin pw iobroker: " + result);

		//result = await this.checkGroupAsync("admin", "admin");
		//this.log.info("check group user admin group admin: " + result);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			 clearTimeout(time);
			 clearTimeout(time1);
			 clearTimeout(time2);
			

			callback();
		} catch (e) {
			callback();
		}
	}
	async readchanges() {
		for (const papier in generatedArray) {
		try {
			//das.log.info("string "+generatedArray[papier].id);
			//das.log.info("url "+"https://"+serverUrl+"/devices/status/"+generatedArray[papier].id);
			const instance = axios.create({
				httpsAgent: new https.Agent({  
				  rejectUnauthorized: false
					})
				  });
				  const resp =await instance.get("https://"+serverUrl+"/devices/status/"+generatedArray[papier].id, {
					auth:{
						username: benutzer,
						password: password,
					}
				});
				time2=setTimeout(async function(){ 
					//das.log.info("daten "+JSON.stringify(resp.data)); 
					const result3=resp.data;
					for (const i in result3.devices){

						objektarry[i] = {
							"id" : result3.devices[i].id,
							"busid" : result3.devices[i].busId,
							"name" : result3.devices[i].name,
							"error" : result3.error,
							"setpoint" : result3.devices[i].status.setpoint,
							"tLimit" : result3.devices[i].status.tLimit,
							"flow" : result3.devices[i].status.flow,
							"flowMax" : result3.devices[i].status.flowMax,
							"power" : result3.devices[i].status.power,
							"flags" : result3.devices[i].status.flags,
						};
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"Name", { val: objektarry[i].name, ack: true });
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"busID", { val: objektarry[i].busid, ack: true });
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"id", { val: objektarry[i].id, ack: true });
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"Setpoint", { val: objektarry[i].setpoint, ack: true });
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"tLimit", { val: objektarry[i].tLimit, ack: true });
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"flow", { val: objektarry[i].flow, ack: true });
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"flowMax", { val: objektarry[i].flowMax, ack: true });
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"power", { val: objektarry[i].power, ack: true });
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"flags", { val: objektarry[i].flags, ack: true });
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"Error", { val: objektarry[i].error, ack: true });
						const setpoint2 =objektarry[i].setpoint/10;
						await das.setStateChangedAsync(generatedArray[i].busid+"."+"Themperatur", { val: setpoint2, ack: true });
						await das.setStateChangedAsync("info.connection", {val: true, ack: true});
						
		
					}
					//das.log.info(`erstelltes array ${JSON.stringify(objektarry)}`);
				
				
				}, 3000);
				time1=setTimeout(function(){ das.readchanges(); }, 3000);
				//this.readchanges();


		}catch (e) {
			das.log.error(e);
			await this.setStateAsync("info.connection", {val: false, ack: true});
			this.readchanges();
			return;
		}
	}
	}

	//Anfrage wie viele Geräte
	async getHttpData(apiAdres){
		try {
			const instance = axios.create({
			httpsAgent: new https.Agent({  
	  		rejectUnauthorized: false
				})
  			});
  			const resp =await instance.get(apiAdres, {
				auth:{
					username: benutzer,
					password: password,
				}
			});
			//das.log.info("result3 "+JSON.stringify(resp.data));
			const result3=resp.data;
			for (const i in result3.devices){

				generatedArray[i] = {
					"id" : result3.devices[i].id,
					"busid" : result3.devices[i].busId,
					"name" : result3.devices[i].name,
				};

			}
			await das.setStateAsync("info.connection", { val: true, ack: true });
			//das.log.info("länge "+generatedArray.length);
			//das.log.info(`erstelltes array ${JSON.stringify(generatedArray)}`);

			for (const test in generatedArray) {
				const id=generatedArray[test].id;
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"Name", {
					type: "state",
					common: {
						name: "Name",
						type: "string",
						role: "indicator",
						read: true,
						write: true,
					},
					native: {id},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"busID", {
					type: "state",
					common: {
						name: "BusId",
						type: "number",
						role: "indicator",
						read: true,
						write: false,
					},
					native: {},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"id", {
					type: "state",
					common: {
						name: "id",
						type: "string",
						role: "indicator",
						read: true,
						write: false,
					},
					native: {},
				});
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"Setpoint", {
					type: "state",
					common: {
						name: "Setpoint",
						type: "number",
						role: "indicator",
						read: true,
						write: true,
					},
					native: {id},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"tLimit", {
					type: "state",
					common: {
						name: "tLimit",
						type: "number",
						role: "indicator",
						read: true,
						write: true,
					},
					native: {},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"Error", {
					type: "state",
					common: {
						name: "testVariable",
						type: "number",
						role: "indicator",
						read: true,
						write: false,
					},
					native: {},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"flags", {
					type: "state",
					common: {
						name: "flags",
						type: "number",
						role: "indicator",
						read: true,
						write: false,
					},
					native: {},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"power", {
					type: "state",
					common: {
						name: "Power",
						type: "number",
						role: "indicator",
						read: true,
						write: false,
					},
					native: {},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"Themperatur", {
					type: "state",
					common: {
						name: "Water",
						type: "number",
						role: "indicator",
						read: true,
						write: false,
					},
					native: {},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"error_text", {
					type: "state",
					common: {
						name: "Error_Text",
						type: "string",
						role: "indicator",
						read: true,
						write: false,
					},
					native: {},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"flow", {
					type: "state",
					common: {
						name: "flow",
						type: "number",
						role: "indicator",
						read: true,
						write: false,
					},
					native: {},
				});
		
				await this.setObjectNotExistsAsync(generatedArray[test].busid+"."+"flowMax", {
					type: "state",
					common: {
						name: "flowMax",
						type: "number",
						role: "indicator",
						read: true,
						write: true,
					},
					native: {id},
				});

		}


		} catch (e) {
			das.log.error(e);
			await this.setStateAsync("info.connection", {val: false, ack: true});
			devicesin=false;

		}
	}


	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (state && state.ack === false) {
			const instance2 = axios.create({
				httpsAgent: new https.Agent({  
				  rejectUnauthorized: false
					})
				  });
				  //const resp;
			// The state was changed
			//this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			const tmp = id.split(".");
			this.log.debug(`state ${tmp}`);
			const objName = tmp.slice(3).join(".");
			const objName2 = tmp.slice(2,3).join(".");
			//this.log.info(`state ${objName2}`);
			switch (objName) {
				case "Setpoint":
					await instance2.put("https://"+serverUrl+"/devices/setpoint/"+objName2 ,"data="+state.val, {
				auth:{
					username: benutzer,
						password: password,
				}
			});
					break;

				case "flowMax":	
				//this.log.info("flow geweschselt");
				/*const instance = axios.create({
					httpsAgent: new https.Agent({  
					  rejectUnauthorized: false
						})
					  });*/
				await instance2.put("https://"+serverUrl+"/devices/setup/"+objName2 ,"flowMax="+state.val, {
            auth:{
                username: benutzer,
					password: password,
            }
        });
					//this.log.info("flow geklappt "+"https://"+serverUrl+"/devices/setup/"+objName2);
					break;

				case "Name":
					await instance2.put("https://"+serverUrl+"/devices/"+objName2 ,"name="+state.val, {
            auth:{
                username: benutzer,
					password: password,
            }
        });
					break;
					case "Themperatur":
						// @ts-ignore
						const setpoint2=state.val*10;
						await instance2.put("https://"+serverUrl+"/devices/setpoint/"+objName2 ,"data="+setpoint2, {
					auth:{
						username: benutzer,
							password: password,
					}
				});
						break;


				default:
					break;
			}

		} else {
			// The state was deleted
			this.log.debug(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new ClageDsx(options);
} else {
	// otherwise start the instance directly
	new ClageDsx();
}