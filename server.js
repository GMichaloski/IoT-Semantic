
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment');

const app = express();
app.use(bodyParser.json());
app.use(cors());  // Enable CORS

const SPARQL_ENDPOINT = "http://localhost:7200/repositories/IoT";

// Function to calculate mean
function calculateMean(values) {
    const sum = values.reduce((acc, value) => acc + value, 0);
    return sum / values.length;
}

// Function to calculate standard deviation
function calculateStd(values, mean) {
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = calculateMean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
}

// Function to remove outliers
function removeOutliers(values) {
    const mean = calculateMean(values);
    const std = calculateStd(values, mean);
    const zScores = values.map(value => Math.abs((value - mean) / std));
    return values.filter((value, index) => zScores[index] < 3);
}

// Function to process results
function processData(results) {
    const timestamps = [];
    const values = [];

    results.forEach(result => {
        const resultTime = parseInt(result.resultTime.value, 10);
        const numericValue = parseFloat(result.numericValue.value);

        timestamps.push(moment.unix(resultTime).utc().format('YYYY-MM-DD HH:mm:ss'));
        values.push(numericValue);
    });

    return { timestamps, values };
}

// POST endpoint to query sensor data
app.post('/query-sensor', async (req, res) => {
    const { sensorName } = req.body;

    const query = `
    PREFIX sosa: <http://www.w3.org/ns/sosa/>
    PREFIX qudt: <http://qudt.org/schema/qudt/>
    
    SELECT ?resultTime ?numericValue
    WHERE {
      ?observation a sosa:Observation ;
                   sosa:resultTime ?resultTime ;
                   sosa:madeBySensor <http://example.org/sensor/${sensorName}> ;
                   sosa:hasResult ?result .
      ?result qudt:numericValue ?numericValue .
    }
    ORDER BY ?resultTime
    `;

    try {
        const fetch = await import('node-fetch').then(module => module.default);

        const response = await fetch(SPARQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-query',
                'Accept': 'application/sparql-results+json'
            },
            body: query
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const results = await response.json();
        const { timestamps, values } = processData(results.results.bindings);

        // Remove outliers
        const cleanedValues = removeOutliers(values);

        // Calculate cumulative values
        const cumulativeValues = cleanedValues.reduce((acc, value) => {
            if (acc.length > 0) {
                acc.push(acc[acc.length - 1] + value);
            } else {
                acc.push(value);
            }
            return acc;
        }, []);

        console.log({
            cleanedData: {
                timestamps,
                values: cleanedValues,
                cumulativeValues
            }
        })

        // Return the processed data
        res.status(200).json({
            cleanedData: {
                timestamps,
                values: cleanedValues,
                cumulativeValues
            }
        });
    } catch (error) {
        console.error('Error executing SPARQL query:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/generated-energy', async (req, res) => {

    const query = `
    PREFIX sosa: <http://www.w3.org/ns/sosa/>
    PREFIX qudt: <http://qudt.org/schema/qudt/>
    
    SELECT ?resultTime ?numericValue
    WHERE {
      ?observation a sosa:Observation ;
                   sosa:resultTime ?resultTime ;
                   sosa:madeBySensor <http://example.org/sensor/gen_kW> ;
                   sosa:hasResult ?result .
      ?result qudt:numericValue ?numericValue .
    }
    ORDER BY ?resultTime
    `;

    try {
        const fetch = await import('node-fetch').then(module => module.default);

        const response = await fetch(SPARQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-query',
                'Accept': 'application/sparql-results+json'
            },
            body: query
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const results = await response.json();
        const { timestamps, values } = processData(results.results.bindings);

        // Remove outliers
        const cleanedValues = removeOutliers(values);

        // Calculate cumulative values
        const cumulativeValues = cleanedValues.reduce((acc, value) => {
            if (acc.length > 0) {
                acc.push(acc[acc.length - 1] + value);
            } else {
                acc.push(value);
            }
            return acc;
        }, []);

        console.log({
            cleanedData: {
                timestamps,
                values: cleanedValues,
                cumulativeValues
            }
        })

        // Return the processed data
        res.status(200).json({
            cleanedData: {
                timestamps,
                values: cleanedValues,
                cumulativeValues
            }
        });
    } catch (error) {
        console.error('Error executing SPARQL query:', error);
        res.status(500).send('Internal Server Error');
    }
});
// GET endpoint to get all sensors
app.get('/sensors', async (req, res) => {
    const query = `
    PREFIX sosa: <http://www.w3.org/ns/sosa/>
    
    SELECT DISTINCT ?sensor
    WHERE {
      ?sensor a sosa:Sensor .
    }
    `;

    try {
        const fetch = await import('node-fetch').then(module => module.default);

        const response = await fetch(SPARQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-query',
                'Accept': 'application/sparql-results+json'
            },
            body: query
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const results = await response.json();
        const sensors = results.results.bindings.map(binding => binding.sensor.value.replace('http://example.org/sensor/', ''));

        console.log(sensors)
        // Return the list of sensors
        res.status(200).json({ sensors });
    } catch (error) {
        console.error('Error executing SPARQL query:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/sensor-total', async (req, res) => {
    const query = `
        PREFIX sosa: <http://www.w3.org/ns/sosa/>
        PREFIX qudt: <http://qudt.org/schema/qudt/>
        PREFIX ex: <http://example.org/>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        
        SELECT ?sensor (SUM(?numericValue) AS ?totalConsumption)
        WHERE {
            ?observation a sosa:Observation ;
                         sosa:madeBySensor ?sensor ;
                         sosa:hasResult ?result .
            ?result qudt:numericValue ?numericValue ;
                    qudt:unit qudt:Watt .
        }
        GROUP BY ?sensor
    `;

    try {
        const fetch = await import('node-fetch').then(module => module.default);

        const response = await fetch(SPARQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sparql-query',
                'Accept': 'application/sparql-results+json'
            },
            body: query
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const results = await response.json();

        // Map the results to include both sensor and total consumption
        const sensorTotals = results.results.bindings.map(binding => ({
            sensor: binding.sensor.value.replace('http://example.org/sensor/', ''),
            totalConsumption: parseFloat(binding.totalConsumption.value)  // Convert to number
        }));

        // Return the list of sensors and their total consumption
        res.status(200).json({ sensorTotals });
    } catch (error) {
        console.error('Error executing SPARQL query:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Serve the HTML file
const path = require('path');
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
