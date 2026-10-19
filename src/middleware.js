const authenticateToken = (req, res, next) => {
    // Get the authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // If no token is provided
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // Check if the token matches your bearer token
    if (token !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Invalid token.' });
    }

    next();
};

export { authenticateToken }; 