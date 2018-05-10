const miio = require('miio')

let Service, Characteristic

module.exports = homebridge => {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-mi-humidifier', 'MiHumidifier', MiHumidifier)
}

class MiHumidifier {

  constructor(log, config) {
    this.log = log
    this.ip = config.ip
    this.token = config.token
    this.name = config.name || 'Humidifier'
    this.model = config.model || 'v1'
    //this.version = config.model || 'v1'
    this.showTemperature = config.showTemperature || false
    this.nameTemperature = config.nameTemperature || 'Temperature'
    //this.showWaterLevel = config.showWaterLevel || false

    this.services = []

    if (!this.ip)
      throw new Error('Your must provide IP address of the Humidifier.')

    if (!this.token)
      throw new Error('Your must provide token of the Humidifier.')

    // Create service
    this.service = new Service.HumidifierDehumidifier(this.name)

    // Active
    this.service
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getActive.bind(this))
      .on('set', this.setActive.bind(this))

    // Current state
    this.service
      .getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
      .on('get', this.getCurrentHumidifierState.bind(this))

    // Target state (only humidifier is supported)
    this.service
      .getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
      .setValue(Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER)

    // Current relative humidity
    this.service
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', this.getCurrentRelativeHumidity.bind(this))

    // Target relative humidity
    // This Characteristic cannot be viewed in the Home.app, but it can be changed using Siri Voice Commands or by using some 3rd Party HomeKit apps.
    this.service
      .addCharacteristic(Characteristic.TargetRelativeHumidity)
      .on('get', this.getTargetRelativeHumidity.bind(this))
      .on('set', this.setTargetRelativeHumidity.bind(this))    

    // Current water level (remaining water level)
    // This characteristic works for zhimi.humidifier.ca1 SmartMi Evaporative Humidifier
    // zhimi.humidifier.v1 will always display 0% Water Level because it lacks a 'depth' property in miio
    if (this.model = 'ca1') {//if (this.version = 'ca1') {
      this.service
        .getCharacteristic(Characteristic.WaterLevel)
        .on('get', this.getWaterLevel.bind(this))
    }
    
    // Rotation speed
    this.service
      .getCharacteristic(Characteristic.RotationSpeed)
      .setProps({
        minValue: 0, // auto - for zhimi.humidifier.ca1
        maxValue: 3, // high
        minStep: 1,
      })
      .on('get', this.getRotationSpeed.bind(this))
      .on('set', this.setRotationSpeed.bind(this))

    // Create service info
    this.serviceInfo = new Service.AccessoryInformation()

    this.serviceInfo
      .setCharacteristic(Characteristic.Manufacturer, 'Xiaomi')
      .setCharacteristic(Characteristic.Model, 'Humidifier')
      .setCharacteristic(Characteristic.SerialNumber, 'Undefined')

    this.services.push(this.service)
    this.services.push(this.serviceInfo)

    // Temperature
    if (this.showTemperature) {
      this.temperatureSensorService = new Service.TemperatureSensor(this.nameTemperature);

      this.temperatureSensorService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getCurrentTemperature.bind(this));

      this.services.push(this.temperatureSensorService);
    }

    this.discover()
  }

  getServices() {
    return this.services
  }

  async discover() {
    try {
      this.device = await miio.device({ address: this.ip, token: this.token })
    } catch (e) {
      this.log.error(e)
    }
  }

  async getActive(callback) {
    try {
      const [ power ] = await this.device.call('get_prop', ['power'])

      callback(
        null,
        (power === 'on')
          ? Characteristic.Active.ACTIVE
          : Characteristic.Active.INACTIVE
      )
    } catch (e) {
      this.log.error('getActive', e)
      callback(e)
    }
  }

  async setActive(state, callback) {
    try {
      const power = (state === Characteristic.Active.ACTIVE)
        ? 'on'
        : 'off'

      const [ result ] = await this.device.call('set_power', [power])

      if (result !== 'ok')
        throw new Error(result)

      callback()
    } catch (e) {
      this.log.error('setActive', e)
      callback(e)
    }
  }

  async getCurrentHumidifierState(callback) {
    try {
      const [ power ] = await this.device.call('get_prop', ['power'])
      callback(
        null,
        (power === 'on')
          ? Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING
          : Characteristic.CurrentHumidifierDehumidifierState.INACTIVE
      )
    } catch (e) {
      this.log.error('getCurrentHumidifierState', e)
      callback(e)
    }
  }

  async getCurrentRelativeHumidity(callback) {
    try {
      const [ humidity ] = await this.device.call('get_prop', ['humidity'])
      callback(null, humidity)
    } catch (e) {
      this.log.error('getCurrentRelativeHumidity', e)
      callback(e)
    }
  }

  async getTargetRelativeHumidity(callback) {
    try {
      const [ limit_hum ] = await this.device.call('get_prop', ['limit_hum'])
      callback(null, limit_hum)
    } catch (e) {
      this.log.error('getTargetRelativeHumidity', e)
      callback(e)
    }
  }

  async setTargetRelativeHumidity(value, callback) {
    try {
      const [ result ] = await this.device.call('set_limit_hum', [value])

      if (result !== 'ok')
        throw new Error(result)

      callback()
    } catch (e) {
      this.log.error('setTargetRelativeHumidity', e)
      callback(e)
    }
  }
  
  //Test: for accurate water level reading in HomeKit. callback(null, waterLevel / 0.12)??
  async getWaterLevel(callback) {
    try {
      const [ waterLevel ] = await this.device.call('get_prop', ['depth'])
      callback(null, waterLevel / 1.2)
    } catch (e) {
      this.log.error('getWaterLevel', e)
      callback(e)
    }
  }  

  async getRotationSpeed(callback) {
    try {
      const modeToSpeed = {
        'auto':   0,
        'silent': 1,
        'medium': 2,
        'high':   3,
      }

      const mode = await this.device.call('get_prop', ['mode'])

      callback(null, modeToSpeed[mode])
    } catch (e) {
      this.log.error('getRotationSpeed', e)
      callback(e)
    }
  }

  async setRotationSpeed(value, callback) {
    try {
      const speedToMode = {
        1: 'silent',
        2: 'medium',
        3: 'high',
      }

      let result

      if (value > 0) {
        [ result ] = await this.device.call('set_mode', [speedToMode[value]])
      } else {
        if (this.model = 'ca1') {//if (this.version = 'ca1') {
          [ result ] = await this.device.call('set_mode', ['auto'])
        } else {
          [ result ] = await this.device.call('set_power', ['off'])
        }
      }

      if (result !== 'ok')
        throw new Error(result)

      callback()
    } catch (e) {
      this.log.error('setRotationSpeed', e)
      callback(e)
    }
  }

  async getCurrentTemperature(callback) {
    try {
      const [ temperature ] = await this.device.call('get_prop', ['temp_dec'])
      callback(null, temperature / 10)
    } catch (e) {
      this.log.error('getCurrentTemperature', e)
      callback(e)
    }
  }
}
