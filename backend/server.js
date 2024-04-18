const express = require("express");
const cors = require("cors");
const { createPool } = require("mysql2/promise");
const asyncHandler = require("express-async-handler");
require("dotenv").config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

const dbConfig = {
    host: 'mysql-omarleithym.alwaysdata.net',
    user: '356120',
    password: 'Dravenn1',
    database: 'omarleithym_2'
};

const pool = createPool(dbConfig);

pool.getConnection()
    .then(connection => {
        console.log("Connected to MySQL database");
        app.listen(3001, () => {
            console.log("Server is running on port 3001");
        });
        connection.release();
    })
    .catch(err => {
        console.error('Database connection failed:', err);
    });

module.exports = pool;

app.post('/register', async (req, res) => {
    const { email, username, gender, birthdate, location, region } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length > 0) {
            return res.status(400).json({ message: 'User already exists with the given email' });
        }

        const result = await pool.query(
            'INSERT INTO users (email, username, gender, birthdate, location, region) VALUES (?, ?, ?, ?, ?, ?)',
            [email, username, gender, birthdate, location, region]
        );

        res.status(201).json({
            email: email,
            username: username,
            gender: gender,
            birthdate: birthdate,
            location: location,
            region: region
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});


app.post('/login', async (req, res) => {
    const { username, email } = req.body;
    console.log("Received login request:", req.body);
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND username = ?', [email, username]);
        console.log("DB Response:", users);
        if (users.length) {
            const user = {
                email: users[0].Email,
                username: users[0].Username,
                gender: users[0].Gender,
                birthdate: users[0].Birthdate,
                location: users[0].Location,
                region: users[0].Region
            };
            res.status(200).json(user);
        } else {
            res.status(400).json({ message: 'Invalid login credentials' });
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get("/top-networks-by-channels", async (req, res) => {
    const query = `
        SELECT tvnetworks.name, COUNT(channel.name) AS NumberOfChannels
        FROM tvnetworks
        JOIN channel ON channel.ispartofnetwork = 1 AND channel.name = tvnetworks.name
        GROUP BY tvnetworks.name
        ORDER BY NumberOfChannels DESC
        LIMIT 5;
    `;
    try {
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching top networks by channels:', err);
        res.status(500).send("Server Error");
    }
});

app.get("/top-networks-by-satellites", async (req, res) => {
    const query = `
    SELECT 
    tvnetworks.name,
    SUM(sc.satellitecount) / COUNT(DISTINCT channel.name) AS AvgSatellitesPerChannel
    FROM 
    tvnetworks
    JOIN 
    channel ON channel.name = tvnetworks.name
    JOIN 
    (
        SELECT 
            channelname, 
            channelfrequency,
            COUNT(DISTINCT satellitename) AS satellitecount
        FROM 
            satellitechannels
        GROUP BY 
            channelname, channelfrequency
    ) AS sc ON channel.name = sc.channelname AND channel.frequency = sc.channelfrequency
    GROUP BY 
    tvnetworks.name
    ORDER BY 
    AvgSatellitesPerChannel DESC
    LIMIT 5;
    `;
    try {
        const [rows] = await pool.query(query);
        res.json(rows);  // Ensure that rows are not undefined
    } catch (err) {
        console.error('Error fetching top networks by satellites:', err);
        res.status(500).send("Server Error");
    }
});

app.get("/top-rockets", async (req, res) => {
    const query = `
        SELECT launchingrocket, COUNT(*) AS NumberOfSatellites
        FROM satellites
        GROUP BY launchingrocket
        ORDER BY NumberOfSatellites DESC
        LIMIT 5;
    `;
    try {
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get("/growing-satellites", async (req, res) => {
    const query = `
        SELECT 
            innerQuery.name,
            innerQuery.NumberOfChannels, 
            innerQuery.launchdate
        FROM 
            (
                SELECT 
                    s.name, 
                    COUNT(*) AS NumberOfChannels, 
                    s.launchdate, 
                    COUNT(*) / DATEDIFF(CURRENT_DATE, s.launchdate) AS GrowthRate
                FROM 
                    satellites s
                JOIN 
                    satellitechannels sc ON s.name = sc.satellitename
                GROUP BY 
                    s.name, s.launchdate
            ) AS innerQuery
        ORDER BY 
            innerQuery.GrowthRate DESC
        LIMIT 5;
    `;
    try {
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get("/channels-by-language", async (req, res) => {
    const query = `
    SELECT sq.language, sq.name, sq.satellitecount
    FROM (
        SELECT 
            c.language, 
            c.name, 
            COUNT(*) AS satellitecount,
            ROW_NUMBER() OVER (PARTITION BY c.language ORDER BY COUNT(*) DESC) AS rownum
        FROM channel c
        JOIN satellitechannels sc ON c.name = sc.channelname AND c.frequency = sc.channelfrequency
        GROUP BY c.language, c.name
    ) sq
    WHERE sq.rownum <= 5
    ORDER BY sq.language, sq.satellitecount DESC;
    `;
    try {
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get("/filtered-channels", async (req, res) => {
    const { region, satellite, hd_sd, language } = req.query;
    let query = `
        SELECT c.*, sc.satellitename FROM channel c
        JOIN satellitechannels sc ON c.name = sc.channelname AND c.frequency = sc.channelfrequency
        JOIN satellites s ON sc.satellitename = s.name
        WHERE 1 = 1
    `;

    if (region) query += ` AND s.region LIKE '%${region}%'`;
    if (satellite) query += ` AND sc.satellitename LIKE '%${satellite}%'`;
    if (hd_sd) query += ` AND c.channelsystem LIKE '%${hd_sd}%'`;
    if (language) query += ` AND c.language LIKE '%${language}%'`;

    try {
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

app.get('/api/channels/:longitude', async (req, res) => {
    const { longitude } = req.params;
    let numericlongitude = parseFloat(longitude.slice(0, -1));
    const direction = longitude.slice(-1);
    if (direction === 'W') {
        numericlongitude = 360 - numericlongitude;
    }
    const lowerbound = numericlongitude - 10;
    const upperbound = numericlongitude + 10;
    let condition;
    if (lowerbound < 0) {
        condition = `(s.position >= '${360 + lowerbound}W' OR s.position <= '${upperbound}E')`;
    } else if (upperbound > 360) {
        condition = `(s.position >= '${lowerbound}E' OR s.position <= '${upperbound - 360}W')`;
    } else {
        condition = `s.position BETWEEN '${lowerbound}${direction}' AND '${upperbound}${direction}'`;
    }

    const query = `
        SELECT c.name AS channelname, c.frequency
        FROM satellitechannels sc
        JOIN channel c ON sc.channelname = c.name AND sc.channelfrequency = c.frequency
        JOIN satellites s ON sc.satellitename = s.name
        WHERE ${condition}
    `;
    try {
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error querying channels:', err);
        res.status(500).send("Server Error");
    }
});

app.post('/add-favorite', async (req, res) => {
    const { userEmail, channelName, channelFrequency } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO userfavorites (useremail, channelname, channelfrequency) VALUES (?, ?, ?)',
            [userEmail, channelName, channelFrequency]
        );
        res.status(201).send('Favorite added successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed to add favorite');
    }
});

app.get('/api/favorites/:email', async (req, res) => {
    const { email } = req.params;
    try {
        const [favorites] = await pool.query(`
            SELECT channel.name as channelname, channel.frequency, channel.encryption 
            FROM userfavorites 
            JOIN channel ON userfavorites.channelname = channel.name 
            WHERE userfavorites.useremail = ?`, 
            [email]
        );
        res.json(favorites);
    } catch (error) {
        console.error('Error fetching favorite channels:', error);
        res.status(500).send('Server error');
    }
});

app.get('/api/favorites/:email/:longitude', async (req, res) => {
    const { email, longitude } = req.params;
    let numericlongitude = parseFloat(longitude.slice(0, -1));
    const direction = longitude.slice(-1);
    if (direction === 'W') {
        numericlongitude = -numericlongitude;
    }

    const lowerbound = numericlongitude - 10;
    const upperbound = numericlongitude + 10;
    const sql = `
        SELECT c.name as channelname, c.frequency, c.encryption
        FROM userfavorites uf
        JOIN channel c ON uf.channelname = c.name AND uf.channelfrequency = c.frequency
        JOIN satellitechannels sc ON sc.channelname = c.name AND sc.channelfrequency = c.frequency
        JOIN satellites s ON sc.satellitename = s.name
        WHERE uf.useremail = ? AND s.position BETWEEN ? AND ?
    `;

    try {
        const [results] = await pool.query(sql, [email, lowerbound, upperbound]);
        res.json(results);
    } catch (error) {
        console.error('Error fetching favorite channels:', error);
        res.status(500).send({ error: 'Server error', details: error.message });
    }
});

