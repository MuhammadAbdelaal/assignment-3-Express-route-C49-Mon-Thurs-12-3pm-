// importing the necessary node modules
const express = require("express");
const path = require("node:path");
const fs = require("node:fs/promises");

// define the path to the users.json file
const FILE_PATH = path.join(__dirname, "users/users.json");

// create an instance of the express app and define the port number
const app = express();
const PORT = 3000;

// ================================================
// Helper Functions
// ================================================

// Obtain the users from users.json file and return the content as an array of JavaScript Objects
async function getUsers() {
  try {
    // 1. Attempt to read the content from the file in utf-8 encoding
    const data = await fs.readFile(FILE_PATH, "utf-8");

    // 2. Parse the content into an array of JavaScript Objects
    // If data is an empty string, fallback to empty array '[]' to avoid SyntaxError
    return JSON.parse(data || "[]");
  } catch (error) {
    // 3. If file doesn't exist (Error code: ENOENT), safely return empty array
    if (error.code === "ENOENT") {
      return [];
    }

    // Rethrow any other unexpected system errors (like permission issues)
    throw error;
  }
}
// Save the updated users to users.json file
async function saveUsers(users) {
  try {
    // 1. Ensure the directory exists before attempting to write the file
    const dirPath = path.dirname(FILE_PATH);
    await fs.mkdir(dirPath, { recursive: true });

    // 2. save the updated users as JSON formatted string in the file
    await fs.writeFile(FILE_PATH, JSON.stringify(users, null, 2), "utf-8"); // null for replacer function, 2 for spaces
  } catch (error) {
    console.error("Failed to write to file:", error);
    throw error;
  }
}

// middleware to Parse incoming JSON requests
app.use(express.json());

// middleware to catch JSON parsing errors and return a 400 Bad Request response
app.use((err, req, res, next) => {
  if (err.status === 400) {
    // syntax errors come with status code 400
    return res.status(400).json({ message: "invalid json" });
  }
  next(err); // if it's not a syntax error, pass it to the next middleware if any
});

// ================================================
// (1) POST route - Add a new user
// ================================================
app.post("/user", async (req, res) => {
  // 1. Obtain data from the request body
  const { name, age, email } = req.body;

  // 2. Email Validation, if no email provided return 400 bad request
  // and don't create the user
  if (!email) {
    return res.status(400).json({ message: "Email is a required field." });
  }

  // 3. Wrap all file operations and logic in a global try/catch
  // to handle async errors without crashing the server
  try {
    // Read the data from users.json file using getUsers() helper function
    let users = await getUsers();

    // 4. Check if the email already exists in the users array
    const emailExists = users.some((user) => user.email === email);
    if (emailExists) {
      return res.status(400).json({ message: "Email already exists." });
    }

    // 5. Gerate an auto increamenting ID for the new user
    // const newId = users.length > 0 ? users[users.length - 1].id + 1 : 1;
    // writing the same ID logic with if condition instead of ternary operator

    let newId = 1; // default ID if no users in the array
    if (users.length > 0) {
      // increment the ID (-1) of the last user by 1
      newId = users[users.length - 1].id + 1;
    }
    // 6. Create the new user object
    const newUser = {
      id: newId,
      name: name || "Anonymous",
      age: age || null,
      email,
    };

    // 7. Update the users array and save back to the file
    users.push(newUser);
    await saveUsers(users);

    // 8. Return a successful 201 response with the newly created profile data
    return res.status(201).json({
      message: "User added successfully.",
    });
  } catch (error) {
    // 9. Catch-all safety net: If reading, parsing, or writing fails, the server recovers gracefully
    console.error("Critical error in POST /user route:", error);
    return res
      .status(500)
      .json({ message: "Internal server error processing user data." });
  }
});

// ================================================
// (2) PATCH route: Update user by ID (e.g., /user/1)
// ================================================
app.patch("/user/:id", async (req, res) => {
  try {
    // Prevent crash if req.body is undefined when trying to destructure
    // the data from it in the below logic
    if (!req.body) {
      // instead send 400 bad request response identifying the error
      return res.status(400).json({ message: "Request body is required." });
    }

    // 1. Obtain data from the request
    const { id } = req.params;
    const { name, age, email } = req.body;

    // 2. Find and validate allowed fields in req.body
    const validKeys = [];
    //if name is provided, string, and not empty
    // then add it to the validKeys array
    if (name && typeof name === "string" && name.trim().length > 0) {
      validKeys.push("name");
    }
    // if age is provided, number, and not zero
    // then add it to the validKeys array
    if (Number(age) && age > 0) {
      validKeys.push("age");
    } else if (age === 0 || age === "0") {
      return res.status(400).json({ message: "Age cannot be zero." });
    }

    if (
      // if email is provided, string, not empty, and has @ symbol
      // then add it to the validKeys array
      email &&
      typeof email === "string" &&
      email.trim().length > 0 &&
      email.includes("@")
    ) {
      validKeys.push("email");
    }

    // 3. If no valid fields at all were sent
    // return 400 bad request response with message to identify the error
    if (validKeys.length === 0) {
      return res
        .status(400)
        .json({ message: "No valid fields provided to update." });
    }

    // if all validations passed, start getting the existing users
    // to update the user that has the matching ID
    // 4. Get the existing users
    const users = await getUsers();

    // 5. Find the user with the matching ID
    // id is comming from the request params as a string,
    // so it must be converted to a number when comparing it
    let user = users.find((user) => user.id === Number(id));

    // 6. If user not found, return 404 Not Found
    if (!user) {
      return res.status(404).json({ message: "User ID not found." });
    }

    // 7. Update only the fields that passed validation in validKeys
    if (validKeys.includes("name")) {
      // attching the name key to user object after trimming the extra spaces
      user.name = name.trim();
    }
    if (validKeys.includes("age")) {
      user.age = +age;
    }
    if (validKeys.includes("email")) {
      user.email = email.trim();
    }

    // 8. Save the updated users to users.json file
    // using the await keyword to wait for the promise to resolve
    await saveUsers(users);

    // 9. Return success response (200 OK) and a message with the updated user data field only
    const updatedField = validKeys.length === 1 ? validKeys[0] : "details";

    return res.status(200).json({
      message: `User ${updatedField} updated successfully.`,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// ================================================
// (3) DELETE route (eg. /user/1) by ID
// coming either from the URL or from the request body
//  {/:id} is the way to write optional params
// to allow both /user/1 (params) and /user (body)
// ================================================
app.delete("/user{/:id}", async (req, res) => {
  try {
    // 1. Obtain the ID

    // Get ID from params first, or from body if params is missing
    let id = req.params.id;

    // if params are missing, try to get ID from body
    if (!id && req.body) {
      id = req.body.id;
    }

    // Check if ID is provided at all
    if (!id) {
      return res.status(400).json({ message: "User ID is required." });
    }

    // 2. Get the existing users
    const users = await getUsers();

    // 3. Find the user with the matching ID
    let user = users.find((user) => user.id === Number(id));

    // 4. If user not found, return 404 Not Found
    if (!user) {
      return res.status(404).json({ message: "User ID not found." });
    }

    // 5. Remove the user from the array using splice
    users.splice(users.indexOf(user), 1);

    // 6. Save the updated users
    await saveUsers(users);

    // 7. Return success response (200 OK)
    return res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// ================================================
// (4) GET route: Get single user by name which is provided as a query parameter.
// (eg. /user/getByName?name=ali)
// ================================================
app.get("/user/getByName", async (req, res) => {
  try {
    // 1. Obtain the name from the query parameter
    const { name } = req.query;

    // check if name is provided
    if (!name) {
      return res
        .status(400)
        .json({ message: "Name query parameter is required." });
    }

    // 2. Get the existing users
    const users = await getUsers();

    // 3. Find the user with the matching name
    const user = users.find((user) => user.name === name);

    // 4. If user not found, return 404 Not Found
    if (!user) {
      return res.status(404).json({ message: "User name not found." });
    }

    // 5. Return success response (200 OK) and the user object
    return res.status(200).json(user);
  } catch (error) {
    console.error("Error getting user by name:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// ================================================
// (5) GET route - Get All Users
// ================================================
app.get("/user", async (req, res) => {
  try {
    // 1. Get the existing users
    const users = (await getUsers()) || []; // fallback to empty array if file doesn't exist

    // 2. Return with end response and send the users JSON list
    return res.status(200).json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// ================================================
// (6) GET route: Filter users by minimum age (eg. /user/filter?minAge=25)
// ================================================
app.get("/user/filter", async (req, res) => {
  try {
    // 1. Obtain the minAge from the query parameter
    const { minAge } = req.query;

    // check if minAge is provided
    if (!minAge) {
      return res
        .status(400)
        .json({ message: "Min age query parameter is required." });
    }

    // 2. Get the existing users
    const users = await getUsers();

    // 3. Filter the users array based on the minAge
    const filteredUsers = users.filter((user) => user.age >= +minAge);

    // 4. If no users found, return no users found message
    if (filteredUsers.length === 0) {
      return res.status(200).json({ message: "no user found." });
    }

    // 5. Return success response (200 OK) and the filtered users array
    return res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error filtering users:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// ================================================
// (7) GET route: Get user by ID (eg. /user/1)
// ================================================
app.get("/user/:id", async (req, res) => {
  try {
    // 1. Obtain the id from the request params
    const { id } = req.params;

    // 2. Get the existing users
    const users = await getUsers();

    // 3. Find the user with the matching ID
    const user = users.find((user) => user.id === Number(id));

    // 4. If user not found, return 404 Not Found
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // 5. Return success response (200 OK) and the user object
    return res.status(200).json(user);
  } catch (error) {
    console.error("Error getting user by ID:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// ================================================
// start the server
app.listen(PORT, () => {
  console.log(`server is running on: http://localhost:${PORT}`);
});
