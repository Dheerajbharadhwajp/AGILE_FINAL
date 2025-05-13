async function addSavingsProgress(challengeId) {
    const amountInput = document.getElementById(`add-amount-${challengeId}`);
    if (!amountInput) {
        console.error(`Amount input for challenge ${challengeId} not found.`);
        return;
    }
    const amountText = amountInput.value.trim();
    const amountToAdd = parseFloat(amountText);

    if (!amountText || isNaN(amountToAdd) || amountToAdd <= 0) {
        alert("Please enter a valid positive amount to add.");
        amountInput.value = ''; 
        amountInput.focus();
        return;
    }

    const addButton = amountInput.nextElementSibling; 
    const originalButtonText = addButton ? addButton.innerHTML : '';
    if (addButton) {
        addButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
        addButton.disabled = true;
    }

    try {
        const response = await fetch(`/api/add_savings_progress`, { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add CSRF token header here if needed
            },
            body: JSON.stringify({
                challenge_id: challengeId,
                amount_added: amountToAdd.toString() 
            }),
        });

        if (!response.ok) {
            let errorMsg = `Server error: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorMsg;
            } catch (e) { /* Ignore */ }
            throw new Error(errorMsg);
        }

        const data = await response.json();

        if (data.success && data.challenge) { 
            const challenge = data.challenge; 

            const savedAmountDisplay = document.getElementById(`saved-${challenge.id}`); 
            if (savedAmountDisplay) {
                savedAmountDisplay.textContent = `₹${parseFloat(challenge.saved_so_far).toFixed(2)}`;
            }

            const progressBar = document.getElementById(`progress-bar-${challenge.id}`); 
            if (progressBar) {
                let newProgress = 0;
                if (challenge.target_amount > 0) {
                    newProgress = (parseFloat(challenge.saved_so_far) / parseFloat(challenge.target_amount) * 100).toFixed(1);
                }
                progressBar.style.width = `${newProgress}%`;
                progressBar.setAttribute('aria-valuenow', newProgress);
                progressBar.textContent = `${newProgress}%`;
            }

            const daysRemainingDisplay = document.getElementById(`days-remaining-${challenge.id}`); 
            if (daysRemainingDisplay && typeof challenge.days_remaining !== 'undefined') {
                const strongTag = daysRemainingDisplay.querySelector('strong') || daysRemainingDisplay;
                strongTag.textContent = challenge.days_remaining;
            }
            
            const challengeItemDiv = document.getElementById(`challenge-${challenge.id}`); 
            if (challengeItemDiv) {
                if (challenge.status === 'completed') {
                    challengeItemDiv.classList.add('completed');
                    const existingBadges = challengeItemDiv.querySelectorAll('.badge.bg-danger, .badge.bg-warning');
                    existingBadges.forEach(b => b.remove());
                    let completedBadge = challengeItemDiv.querySelector('.badge.bg-success');
                    if (!completedBadge) {
                        const titleElement = challengeItemDiv.querySelector('h5');
                        completedBadge = document.createElement('span');
                        completedBadge.className = 'badge bg-success fs-6 px-3 py-2'; // Added padding like in HTML
                        completedBadge.innerHTML = 'Completed! <i class="fas fa-check-circle ms-1"></i>';
                        if (titleElement) {
                           const flexContainer = titleElement.closest('.d-flex');
                           if(flexContainer) flexContainer.appendChild(completedBadge);
                           else titleElement.insertAdjacentElement('afterend', completedBadge);
                        }
                    }
                    const inputGroupToRemove = document.getElementById(`add-amount-${challenge.id}`)?.closest('.input-group');
                    if (inputGroupToRemove) {
                        inputGroupToRemove.remove();
                    }
                } else if (challenge.status === 'active' && challenge.days_remaining === 0 && challenge.end_date) { 
                    challengeItemDiv.classList.remove('completed');
                    const existingBadges = challengeItemDiv.querySelectorAll('.badge.bg-success, .badge.bg-warning');
                    existingBadges.forEach(b => b.remove());
                    let deadlineBadge = challengeItemDiv.querySelector('.badge.bg-danger');
                     if (!deadlineBadge) {
                        const titleElement = challengeItemDiv.querySelector('h5');
                        deadlineBadge = document.createElement('span');
                        deadlineBadge.className = 'badge bg-danger fs-6 px-3 py-2'; // Added padding
                        deadlineBadge.textContent = 'Deadline Reached!';
                         if (titleElement) {
                           const flexContainer = titleElement.closest('.d-flex');
                           if(flexContainer) flexContainer.appendChild(deadlineBadge);
                           else titleElement.insertAdjacentElement('afterend', deadlineBadge);
                        }
                    }
                }
            }
            if (amountInput) { 
                 amountInput.value = '';
            }
        } else {
            alert(data.message || "Failed to add savings. Please check server response.");
            if (amountInput) {
                amountInput.value = '';
            }
        }
    } catch (error) {
        console.error('Error adding savings:', error);
        alert(`An error occurred: ${error.message}`);
        if (amountInput) { 
            amountInput.value = '';
        }
    } finally {
        if (addButton) {
            addButton.innerHTML = originalButtonText;
            addButton.disabled = false;
        }
    }
}

async function deleteChallenge(challengeId) {
    if (!confirm('Are you sure you want to delete this savings challenge? This action cannot be undone.')) {
        return;
    }

    const challengeItemDiv = document.getElementById(`challenge-${challengeId}`);
    if (challengeItemDiv) {
        challengeItemDiv.style.opacity = '0.5'; 
    }

    try {
        const response = await fetch(`/api/delete_challenge/${challengeId}`, {
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json',
                // Add CSRF token header here if needed
            },
        });

        if (!response.ok) {
            let errorMsg = `Server error: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorMsg;
            } catch (e) { /* Ignore */ }
            throw new Error(errorMsg);
        }

        const data = await response.json();

        if (data.success) {
            if (challengeItemDiv) {
                challengeItemDiv.remove(); 
            }
            const challengesList = document.getElementById('active-challenges-list');
            const noChallengesMessageEl = document.getElementById('no-challenges-message');

            if (challengesList && noChallengesMessageEl) {
                if (challengesList.children.length === 0) {
                    noChallengesMessageEl.style.display = 'block'; 
                } else {
                    noChallengesMessageEl.style.display = 'none';
                }
            }
        } else {
            alert(data.message || 'Failed to delete challenge.');
            if (challengeItemDiv) {
                challengeItemDiv.style.opacity = '1'; 
            }
        }
    } catch (error) {
        console.error('Error deleting challenge:', error);
        alert(`An error occurred: ${error.message}`);
        if (challengeItemDiv) {
            challengeItemDiv.style.opacity = '1'; 
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const getThemeColor = (variableName, fallback) => {
        if (typeof getComputedStyle === 'function' && document.documentElement) {
            const color = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
            return color || fallback;
        }
        return fallback;
    };
    
    const stockList = document.getElementById('stock-suggestions-list');
    const stockLoader = document.getElementById('stock-loader');

    if (stockList && stockLoader) {
        stockLoader.remove(); 

        const exampleStocks = [
            { name: 'Reliance Industries (RELIANCE.NS)', trend: 'Up', detail: 'Strong fundamentals, diverse portfolio.' },
            { name: 'Tata Consultancy Services (TCS.NS)', trend: 'Down', detail: 'Leading IT services provider.' },
            { name: 'HDFC Bank (HDFCBANK.NS)', trend: 'Up', detail: 'Consistent growth in banking sector.' },
            { name: 'Infosys (INFY.NS)', trend: 'Neutral', detail: 'Global IT consulting and services.'}
        ];

        exampleStocks.forEach(stock => {
            const item = document.createElement('a');
            item.href = "#"; 
            item.className = 'list-group-item list-group-item-action flex-column align-items-start';
            item.style.backgroundColor = getThemeColor('--card-bg', 'rgba(30, 41, 59, 0.7)');
            item.style.borderColor = 'rgba(76, 201, 240, 0.2)';
            item.style.color = getThemeColor('--text-color', '#e9ecef');
            item.style.marginBottom = '10px';
            item.style.borderRadius = getThemeColor('--border-radius', '16px');

            item.innerHTML = `
                <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">${stock.name}</h5>
                    <small class="${stock.trend === 'Up' ? 'text-success' : (stock.trend === 'Down' ? 'text-danger' : 'text-warning')} fw-bold">
                        <i class="fas ${stock.trend === 'Up' ? 'fa-arrow-up' : (stock.trend === 'Down' ? 'fa-arrow-down' : 'fa-minus')} me-1"></i>
                        ${stock.trend}
                    </small>
                </div>
                <p class="mb-1" style="font-size: 0.95rem;">${stock.detail}</p>
                <small class="text-muted" style="font-size: 0.8rem;">Disclaimer: Example data. Not financial advice.</small>
            `;
            stockList.appendChild(item);
            item.addEventListener('click', (e) => e.preventDefault());
        });
    } else {
        if (!stockList) console.warn("Element with ID 'stock-suggestions-list' not found.");
        if (!stockLoader && stockList) console.warn("Element with ID 'stock-loader' not found, but stock list exists.");
    }

    // Ensure "No challenges" message is hidden if there are challenges on load
    const challengesListOnLoad = document.getElementById('active-challenges-list');
    const noChallengesMessageOnLoad = document.getElementById('no-challenges-message');
    if (challengesListOnLoad && noChallengesMessageOnLoad) {
        if (challengesListOnLoad.querySelector('.challenge-item')) { // Check if any challenge item exists
            noChallengesMessageOnLoad.style.display = 'none';
        } else {
            noChallengesMessageOnLoad.style.display = 'block';
        }
    }
});