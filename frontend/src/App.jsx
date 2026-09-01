import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "https://chatwithme-3ade.onrender.com";
const WS_URL = "wss://chatwithme-3ade.onrender.com";

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const [error, setError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);


  // =========================
  // GET OTHER USER ID
  // =========================

  const getReceiverId = (currentUserId) => {
    return currentUserId === 1 ? 2 : 1;
  };


  // =========================
  // AUTO SCROLL
  // =========================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages]);


  // =========================
  // LOAD SAVED USER
  // =========================

  useEffect(() => {
    const savedUser = localStorage.getItem("chatUser");

    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);


  // =========================
  // REQUEST NOTIFICATION
  // PERMISSION
  // =========================

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support notifications");
      return;
    }

    if (Notification.permission === "default") {
      const permission =
        await Notification.requestPermission();

      console.log(
        "Notification permission:",
        permission
      );
    }
  };


  // =========================
  // LOGIN
  // =========================

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoginLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.detail || "Login failed"
        );

        return;
      }

      const loggedInUser = {
        id: data.user_id,
        email: data.email
      };

      localStorage.setItem(
        "chatUser",
        JSON.stringify(loggedInUser)
      );

      setUser(loggedInUser);

      // Ask for notification permission
      await requestNotificationPermission();

    } catch (err) {

      console.error(err);

      setError(
        "Cannot connect to server"
      );

    } finally {

      setLoginLoading(false);

    }
  };


  // =========================
  // LOAD CHAT HISTORY
  // =========================

  useEffect(() => {
    if (!user) return;

    const receiverId =
      getReceiverId(user.id);

    const loadMessages = async () => {
      try {

        const response = await fetch(
          `${API_URL}/messages/${user.id}/${receiverId}`
        );

        const data =
          await response.json();

        if (response.ok) {
          setMessages(data);
        }

      } catch (err) {

        console.error(
          "Error loading messages:",
          err
        );

      }
    };

    loadMessages();

  }, [user]);


  // =========================
  // WEBSOCKET CONNECTION
  // =========================

  useEffect(() => {
    if (!user) return;

    const websocket = new WebSocket(
      `${WS_URL}/ws/${user.id}`
    );

    socketRef.current = websocket;


    // -------------------------
    // CONNECTED
    // -------------------------

    websocket.onopen = () => {

      console.log(
        "WebSocket connected"
      );

      setConnected(true);

    };


    // -------------------------
    // DISCONNECTED
    // -------------------------

    websocket.onclose = () => {

      console.log(
        "WebSocket disconnected"
      );

      setConnected(false);

    };


    // -------------------------
    // ERROR
    // -------------------------

    websocket.onerror = (error) => {

      console.error(
        "WebSocket error:",
        error
      );

      setConnected(false);

    };


    // =========================
    // RECEIVE REAL-TIME MESSAGE
    // =========================

    websocket.onmessage = (event) => {

      const data =
        JSON.parse(event.data);

      console.log(
        "New WebSocket data:",
        data
      );


      if (data.type === "message") {

        // ---------------------
        // ADD MESSAGE TO CHAT
        // ---------------------

        setMessages(
          (previousMessages) => {

            const alreadyExists =
              previousMessages.some(
                (message) =>
                  message.id === data.id
              );

            if (alreadyExists) {
              return previousMessages;
            }

            return [
              ...previousMessages,
              data
            ];

          }
        );


        // ---------------------
        // SHOW NOTIFICATION
        // ONLY TO RECEIVER
        // ---------------------

        if (
          data.receiver_id === user.id &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {

          new Notification(
            "New message 💬",
            {
              body: data.message,
              tag: `message-${data.id}`
            }
          );

        }

      }


      if (data.type === "error") {

        console.error(
          data.message
        );

      }

    };


    // =========================
    // CLEANUP
    // =========================

    return () => {

      websocket.close();

      socketRef.current = null;

    };

  }, [user]);


  // =========================
  // SEND MESSAGE
  // =========================

  const sendMessage = () => {

    const text =
      newMessage.trim();

    if (!text) return;


    if (
      !socketRef.current ||
      socketRef.current.readyState !== WebSocket.OPEN
    ) {

      alert(
        "Connection lost. Please refresh the page."
      );

      return;

    }


    const receiverId =
      getReceiverId(user.id);


    socketRef.current.send(
      JSON.stringify({
        receiver_id: receiverId,
        message: text
      })
    );


    setNewMessage("");

  };


  // =========================
  // ENTER TO SEND
  // =========================

  const handleKeyDown = (e) => {

    if (e.key === "Enter") {
      sendMessage();
    }

  };


  // =========================
  // LOGOUT
  // =========================

  const handleLogout = () => {

    if (socketRef.current) {
      socketRef.current.close();
    }

    localStorage.removeItem(
      "chatUser"
    );

    setUser(null);
    setMessages([]);
    setEmail("");
    setPassword("");
    setConnected(false);

  };


  // =========================
  // FORMAT TIME
  // =========================

  const formatTime = (date) => {

    if (!date) return "";

    return new Date(
      date
    ).toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );

  };


  // =========================
  // LOGIN PAGE
  // =========================

  if (!user) {

    return (

      <div className="app">

        <div className="login-card">

          <h1>
            Chat With Me 💬
          </h1>

          <p className="subtitle">
            Login to continue chatting
          </p>


          <form
            onSubmit={handleLogin}
          >

            <label>
              Email
            </label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) =>
                setEmail(
                  e.target.value
                )
              }
              required
            />


            <label>
              Password
            </label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }
              required
            />


            {error && (

              <p className="error">
                {error}
              </p>

            )}


            <button
              type="submit"
              disabled={loginLoading}
            >

              {loginLoading
                ? "Logging in..."
                : "Login"}

            </button>

          </form>

        </div>

      </div>

    );

  }


  // =========================
  // CHAT PAGE
  // =========================

  return (

    <div className="chat-page">

      <div className="chat-container">


        {/* =====================
            HEADER
        ====================== */}

        <div className="chat-header">

          <div>

            <h2>
              Chat With Me 💬
            </h2>

            <p
              className={
                connected
                  ? "online"
                  : "offline"
              }
            >

              <span
                className="status-dot"
              />

              {connected
                ? "Connected"
                : "Disconnected"}

            </p>

          </div>


          <button
            className="logout-button"
            onClick={handleLogout}
          >
            Logout
          </button>

        </div>


        {/* =====================
            MESSAGES
        ====================== */}

        <div className="messages">

          {messages.length === 0 && (

            <div className="empty-chat">

              No messages yet.

              <br />

              Start the conversation 👋

            </div>

          )}


          {messages.map(
            (message) => {

              const isMine =
                message.sender_id === user.id;

              return (

                <div
                  key={message.id}
                  className={
                    `message-row ${
                      isMine
                        ? "mine"
                        : "theirs"
                    }`
                  }
                >

                  <div className="message-bubble">

                    {message.message}

                    <span
                      className="message-time"
                    >

                      {formatTime(
                        message.created_at
                      )}

                    </span>

                  </div>

                </div>

              );

            }
          )}


          <div
            ref={messagesEndRef}
          />

        </div>


        {/* =====================
            INPUT
        ====================== */}

        <div className="message-input-container">

          <input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) =>
              setNewMessage(
                e.target.value
              )
            }
            onKeyDown={
              handleKeyDown
            }
          />


          <button
            className="send-button"
            onClick={sendMessage}
          >
            Send
          </button>

        </div>

      </div>

    </div>

  );
}

export default App;