const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const asyncHandler = require("express-async-handler");
const User = require("../models/user");

const genToken = (id) => {
    return jwt.sign({id}, process.env.JWT_SECRET, {
        expiresIn: "30d"
    })
}


const registerUser = asyncHandler(async (req, res) => {
    const {username, email, password, firstName, lastName} = req.body;
    if(!username || !email || !password || !firstName || !lastName) {
        res.status(400);
        throw new Error("Please fill in all fields")
    }

    const userExists = await User.findOne({username})
    const emailExists = await User.findOne({email})

    if (userExists) {
        res.status(400);
        throw new Error("Username exists")
    }

    if (emailExists) {
        res.status(400);
        throw new Error("Email exists")
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const user = await User.create({
        username,
        email,
        password: hashedPassword,
        firstName,
        lastName
    })

    if(user) {
        res.status(201).json({
            _id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            token: genToken(user._id)
        })
    }
    else {
        res.status(400);
        throw new Error("invalid user data")
    }
})

const loginUser = asyncHandler(async (req, res) => {
    const {username, password} = req.body;
    const user = await User.findOne({username})

    if(user && (await bcrypt.compare(password, user.password))) {
        res.status(201).json({
            id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            token: genToken(user._id)
        })
    }
    else {
        res.status(400);
        throw new Error("invalid credentials")
    }

})

const getUser = asyncHandler(async (req, res) => {
    const {_id, email, username, firstName, lastName} = await User.findById(req.user.id)
    res.status(200).json({
        id: _id,
        email,
        username,
        firstName,
        lastName
    })
})

router.post('/register', registerUser)
router.post('/login', loginUser)
router.get('/:id', getUser)

module.exports = router;