#!/usr/bin/env node
import WPILibWSRomiRobot from "./romi-robot";
import { WPILibWSRobotEndpoint, WPILibWSServerConfig, WPILibWSClientConfig } from "@wpilib/wpilib-ws-robot";
import MockI2C from "./i2c/mock-i2c";
import I2CPromisifiedBus from "./i2c/i2c-connection";
import program from "commander";
import ServiceConfiguration, { EndpointType } from "./service-config";
import RomiConfiguration from "./romi-config";
import ProgramArguments from "./program-arguments";
import MockRomiI2C from "./mocks/mock-romi";
import { FIRMWARE_IDENT } from "./romi-shmem-buffer";

// Set up command line options
program
    .version("0.0.1")
    .name("wpilibws-romi")
    .option("-c, --config <file>", "configuration file")
    .option("-e, --endpoint-type <type>", "endpoint type (client/server)", "server")
    .option("-m, --mock-i2c", "Force the use of Mock I2C")
    .option("-p, --port <port>", "port to listen/connect to")
    .option("-h, --host <host>", "host to connect to (required for client)")
    .option("-u, --uri <uri>", "websocket URI")
    .helpOption("--help", "display help for command");

program.parse(process.argv);

let serviceConfig: ServiceConfiguration;
let romiConfig: RomiConfiguration;

try {
    serviceConfig = new ServiceConfiguration(program as ProgramArguments);
}
catch (err) {
    console.log(err.message);
    process.exit();
}

try {
    romiConfig = new RomiConfiguration(program as ProgramArguments);
}
catch (err) {
    romiConfig = new RomiConfiguration();
    console.log("[CONFIG] Error loading romi configuration")
    console.log(err.message);
    console.log("[CONFIG] Falling back to defaults");
}

const I2C_BUS_NUM: number = 1;

// Set up the i2c bus out here
let i2cBus: I2CPromisifiedBus;
let endpoint: WPILibWSRobotEndpoint;

if (!serviceConfig.forceMockI2C) {
    try {
        const HardwareI2C = require("./i2c/hw-i2c").default;
        i2cBus = new HardwareI2C(I2C_BUS_NUM);
    }
    catch (err) {
        console.log("[I2C] Error creating hardware I2C: ", err.message);
        console.log("[I2C] Falling back to MockI2C");
        i2cBus = new MockI2C(I2C_BUS_NUM);

        const mockRomi: MockRomiI2C = new MockRomiI2C(0x14);
        mockRomi.setFirmwareIdent(FIRMWARE_IDENT);
        (i2cBus as MockI2C).addDeviceToBus(mockRomi);
    }
}
else {
    console.log("[I2C] Requested to use mock I2C");
    i2cBus = new MockI2C(I2C_BUS_NUM);
    const mockRomi: MockRomiI2C = new MockRomiI2C(0x14);
    mockRomi.setFirmwareIdent(FIRMWARE_IDENT);
    (i2cBus as MockI2C).addDeviceToBus(mockRomi);
}

console.log(`[CONFIG] External Pins: ${romiConfig.pinConfigurationString}`);

const robot: WPILibWSRomiRobot = new WPILibWSRomiRobot(i2cBus, 0x14, romiConfig.externalIOConfig);

if (serviceConfig.endpointType === EndpointType.SERVER) {
    const serverSettings: WPILibWSServerConfig = {
        port: serviceConfig.port,
        uri: serviceConfig.uri
    };

    endpoint = WPILibWSRobotEndpoint.createServerEndpoint(robot, serverSettings);
    console.log(`[CONFIG] Mode: Server, Port: ${serviceConfig.port}, URI: ${serviceConfig.uri}`);
}
else {
    const clientSettings: WPILibWSClientConfig = {
        hostname: serviceConfig.host,
        port: serviceConfig.port,
        uri: serviceConfig.uri
    };

    endpoint = WPILibWSRobotEndpoint.createClientEndpoint(robot, clientSettings);
    console.log(`[CONFIG] Mode: Client, Host: ${serviceConfig.host}, Port: ${serviceConfig.port}, URI: ${serviceConfig.uri}`);
}

endpoint.startP()
.then(() => {
    console.log(`[SERVICE] Endpoint (${serviceConfig.endpointType}) Started`);
});
