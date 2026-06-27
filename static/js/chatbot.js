// Chatbot Logic
const chatHistory = [];

const toggleBtn = document.getElementById('chatbot-toggle');
const closeBtn = document.getElementById('chatbot-close');
const chatWindow = document.getElementById('chatbot-window');
const messagesEl = document.getElementById('chatbot-messages');
const inputEl = document.getElementById('chatbot-input');
const sendBtn = document.getElementById('chatbot-send');

// Toggle chat window
toggleBtn.addEventListener('click', () => {
    chatWindow.classList.remove('hidden');
    toggleBtn.classList.add('hidden');
    inputEl.focus();
});

closeBtn.addEventListener('click', () => {
    chatWindow.classList.add('hidden');
    toggleBtn.classList.remove('hidden');
});

// Add a message to chat
function addMessage(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}-message`;
    // Convert line breaks and simple markdown
    const formatted = content
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>\$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>\$1</em>');
    messageDiv.innerHTML = formatted;
    messagesEl.appendChild(messageDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Show typing indicator
function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'chat-message bot-message typing';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typingDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
}

// Send message to backend
async function sendMessage() {
    const message = inputEl.value.trim();
    if (!message) return;
    
    addMessage(message, 'user');
    chatHistory.push({ role: 'user', content: message });
    inputEl.value = '';
    sendBtn.disabled = true;
    showTyping();
    
    try {
        const response = await fetch('/api/chatbot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                history: chatHistory,
            })
        });
        
        const data = await response.json();
        removeTyping();
        
        const botResponse = data.response || 'Sorry, I had trouble responding.';
        addMessage(botResponse, 'bot');
        chatHistory.push({ role: 'assistant', content: botResponse });
        
    } catch (error) {
        console.error('Chat error:', error);
        removeTyping();
        addMessage('⚠️ Connection error. Please try again.', 'bot');
    } finally {
        sendBtn.disabled = false;
        inputEl.focus();
    }
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});