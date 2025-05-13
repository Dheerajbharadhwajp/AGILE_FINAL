function displayMessage(message, sender) {
    const chatbox = document.getElementById('chatbox');
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.className = sender === 'user' ? 'user-message' : 'bot-message'; // Apply different styles
    chatbox.appendChild(messageElement);
    chatbox.scrollTop = chatbox.scrollHeight; // Scroll to the bottom
}

async function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();

    if (message === "") return; // Don't send empty messages

    displayMessage(message, 'user'); // Display user's message
    userInput.value = ''; // Clear input field

    try {
        const response = await fetch('/ask_chatbot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        displayMessage(data.response, 'bot'); // Display bot's response

    } catch (error) {
        console.error('Error sending message:', error);
        displayMessage("Sorry, I couldn't connect to the assistant right now.", 'bot');
    }
}

// Allow sending message by pressing Enter key
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// --- Delete Expense Functionality ---
async function deleteExpense(expenseId) {
    if (!confirm('Are you sure you want to delete this expense?')) {
        return;
    }

    try {
        const response = await fetch(`/delete_expense/${expenseId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            // Remove the list item from the DOM
            const listItem = document.querySelector(`li[data-id='${expenseId}']`);
            if (listItem) {
                listItem.remove();
            }

            // --- Update the analysis display ---
            const totalExpensesSpan = document.getElementById('total-expenses');
            if (totalExpensesSpan) {
                totalExpensesSpan.textContent = data.total_expenses.toFixed(2);
            }

            const comparisonTextElement = document.getElementById('income-comparison-text');
            if (comparisonTextElement) {
                 // Update comparison text or clear if no longer applicable
                 if(data.income_comparison) {
                    comparisonTextElement.textContent = data.income_comparison;
                    // Add/remove warning span based on is_high flag
                    const warningSpan = comparisonTextElement.querySelector('.warning');
                    if (data.is_high && !warningSpan) {
                        const newWarning = document.createElement('span');
                        newWarning.className = 'warning';
                        newWarning.textContent = ' (Expenses seem high!)';
                        comparisonTextElement.appendChild(newWarning);
                    } else if (!data.is_high && warningSpan) {
                        warningSpan.remove();
                    }
                 } else {
                     // If income comparison is gone (e.g., income removed?), clear or update text
                     // For simplicity, just let the next page load handle complex updates,
                     // but ensure the old text doesn't linger inaccurately.
                     // Or maybe update to a generic message if comparison becomes null
                     // comparisonTextElement.textContent = "(Enter income/expenses for analysis)";
                 }

            }
            // Note: Updating the category breakdown list dynamically via JS is more complex.
            // A full page reload (e.g., by removing redirect after POST in Flask)
            // or a more involved JS update would be needed for that part.
            // For now, the list might be slightly stale until next page load after delete.

            // Check if the main expense log list is now empty
            const expensesUl = document.getElementById('expenses-ul');
            if (expensesUl && expensesUl.querySelectorAll(':scope > li').length === 0) {
                 const li = document.createElement('li');
                 li.textContent = 'No expenses added yet.';
                 expensesUl.appendChild(li);
            }

        } else {
            alert('Failed to delete expense.');
        }

    } catch (error) {
        console.error('Error deleting expense:', error);
        alert('An error occurred while trying to delete the expense.');
    }
}

// Keep the DOMContentLoaded listener (or adjust if needed)
document.addEventListener('DOMContentLoaded', function() {
    const expensesUl = document.getElementById('expenses-ul');
    const listItems = expensesUl.querySelectorAll(':scope > li');
    if (listItems.length === 0 || (listItems.length === 1 && listItems[0].textContent.trim() === 'No expenses added yet.')) {
        expensesUl.innerHTML = '<li>No expenses added yet.</li>';
    } else if (listItems.length > 1 && listItems[0].textContent.trim() === 'No expenses added yet.') {
        listItems[0].remove();
    }
});