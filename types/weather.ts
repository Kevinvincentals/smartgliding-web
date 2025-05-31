/**
 * Weather condition types for aviation forecasting
 */
export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "overcast"
  | "fog"
  | "light-rain"
  | "rain"
  | "thunderstorm"
  | "snow"

/**
 * Hourly weather forecast data for aviation purposes
 */
export interface HourlyForecast {
  /** Hour of the day (0-23) */
  hour: number
  /** Temperature in Celsius */
  temperature: number
  /** Feels-like temperature in Celsius */
  feelsLike: number
  /** Wind speed in km/h */
  windSpeed: number
  /** Wind direction in degrees (0-360) */
  windDirection: number
  /** Wind gust speed in km/h */
  windGust: number
  /** Current weather condition */
  condition: WeatherCondition
  /** Relative humidity percentage (0-100) */
  humidity: number
  /** Cloud base height in meters */
  cloudBase: number
  /** Visibility in kilometers */
  visibility: number
  /** Thermal strength indicator (0-10) */
  thermalStrength: number
}

/**
 * Daily weather summary for aviation planning
 */
export interface DailyWeatherSummary {
  /** Date in ISO format */
  date: string
  /** Minimum temperature for the day in Celsius */
  minTemperature: number
  /** Maximum temperature for the day in Celsius */
  maxTemperature: number
  /** Average wind speed for the day in km/h */
  avgWindSpeed: number
  /** Dominant weather condition for the day */
  condition: WeatherCondition
  /** Flight suitability score (0-10) */
  flightSuitability: number
  /** Hourly forecasts for the day */
  hourlyForecasts: HourlyForecast[]
}

