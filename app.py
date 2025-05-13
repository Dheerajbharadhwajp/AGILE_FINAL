from flask import Flask, render_template, request, jsonify, redirect, url_for, session
import os
import google.generativeai as genai
from dotenv import load_dotenv
import datetime

load_dotenv()
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "a_super_secret_key_for_sessions_dev") # Important for sessions

# --- Configure Google AI ---
api_key = os.getenv("GOOGLE_API_KEY")
model = None
ai_configured = False
if not api_key:
    print("Warning: GOOGLE_API_KEY environment variable not set. AI features disabled.")
else:
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        ai_configured = True
        print("Google AI SDK configured successfully.")
    except Exception as e:
        print(f"Error configuring Google AI SDK: {e}. AI features disabled.")

# --- In-memory storage ---
expenses = []
expense_id_counter = 0
user_income = None
savings_challenges = []
challenge_id_counter = 0

# --- Helper Function for Expense Analysis ---
def analyze_expenses(current_expenses, income):
    if not current_expenses:
        return {"total": 0, "categories": {}, "message": "No expenses logged yet."}

    total_expenses = sum(item['amount'] for item in current_expenses)
    categories = {}
    for expense in current_expenses:
        cat = expense['category']
        categories[cat] = categories.get(cat, 0) + expense['amount']

    sorted_categories = dict(sorted(categories.items(), key=lambda item: item[1], reverse=True))

    analysis = {
        "total": total_expenses,
        "categories": sorted_categories,
        "category_summary": ", ".join([f"{cat}: ₹{amt:.2f}" for cat, amt in sorted_categories.items()]),
        "income_comparison": None
    }

    if income and income > 0:
        percentage = (total_expenses / income) * 100
        analysis["income_comparison"] = f"Expenses are {percentage:.1f}% of your income (₹{income:.2f})."
        analysis["is_high"] = total_expenses >= (income * 0.90) # Example threshold
    else:
        analysis["is_high"] = False # Default if no income

    return analysis

# --- Routes ---

@app.route('/')
def login_page_route():
    return render_template('login.html')

@app.route('/app', methods=['GET', 'POST'])
def main_application():
    global expense_id_counter, user_income
    if request.method == 'POST':
        form_type = request.form.get('form_type')

        if form_type == 'expense':
            try:
                description = request.form.get('description')
                amount_str = request.form.get('amount')
                category = request.form.get('category')

                if not description or not amount_str or not category:
                    print("Error: Missing expense form data")
                else:
                    amount = float(amount_str)
                    expense_id_counter += 1
                    expenses.append({
                        'id': expense_id_counter,
                        'description': description,
                        'amount': amount,
                        'category': category,
                    })
            except ValueError:
                print("Error: Invalid amount entered for expense")
            except Exception as e:
                print(f"An unexpected error occurred adding expense: {e}")

        elif form_type == 'income':
            try:
                income_str = request.form.get('income')
                if income_str:
                    user_income = float(income_str)
                else:
                    user_income = None # Allow clearing income
            except ValueError:
                print("Error: Invalid income amount entered.")
                user_income = None # Reset on error
            except Exception as e:
                print(f"An unexpected error occurred updating income: {e}")
        
        return redirect(url_for('main_application'))

    analysis_results = analyze_expenses(expenses, user_income)
    return render_template(
        'main_app.html',
        expenses=expenses,
        income=user_income,
        analysis=analysis_results
    )

@app.route('/delete_expense/<int:expense_id>', methods=['POST'])
def delete_expense(expense_id):
    global expenses
    expenses = [expense for expense in expenses if expense['id'] != expense_id]
    analysis_results = analyze_expenses(expenses, user_income)
    return jsonify({
        'success': True,
        'total_expenses': analysis_results['total'],
        'income_comparison': analysis_results.get('income_comparison', None),
        'is_high': analysis_results.get('is_high', False)
    })

@app.route('/ask_chatbot', methods=['POST'])
def ask_chatbot():
    if not ai_configured or not model:
        return jsonify({'response': "Sorry, the AI assistant is not configured or available."})

    user_message = request.json.get('message', '').lower()
    response_text = "Sorry, I couldn't generate a response." # Default

    try:
        analysis = analyze_expenses(expenses, user_income)
        analysis_summary = f"Current total monthly expenses: ₹{analysis['total']:.2f}. "
        if user_income:
            analysis_summary += f"Monthly income: ₹{user_income:.2f}. "
            analysis_summary += analysis.get('income_comparison', "") + " "
        if analysis['categories']:
            analysis_summary += f"Top spending categories: {analysis['category_summary']}. "
        
        # Add quiz result to context if available
        quiz_personality = session.get('quiz_result')
        if quiz_personality:
            analysis_summary += f"User's financial personality type: {quiz_personality}. "


        prompt_lines = [
            "You are a friendly and helpful financial assistant chatbot within an expense tracking app.",
            "Your goal is to provide concise, practical money-saving tips and financial advice based on the user's questions and their financial context (if provided).",
            "If the user asks about their personality type, confirm it if available in the context, or suggest they take the quiz.",
            "Keep answers relatively short and easy to understand.",
            "Do not give specific real-time investment advice (buy/sell this *now*).",
            "Here is the user's financial context based on their tracked data:",
            analysis_summary,
            "---",
            f"User's question: \"{user_message}\""
        ]
        
        if "save" in user_message or "saving" in user_message or "reduce expenses" in user_message or "cut back" in user_message:
            prompt_lines.insert(5, "The user is asking specifically about saving money. Analyze their context (especially spending categories, income comparison, and personality type if available) to give personalized tips.")
            if analysis.get("is_high", False):
                prompt_lines.append(
                    "Since their expenses appear high relative to income, after giving saving tips, *briefly* mention 3 well-known, large-cap companies as *examples* of stocks one *might* consider investing in *only after* building an emergency fund and managing debt. **Crucially, include a very strong disclaimer** stating these are just examples for illustration, NOT financial advice, NOT a recommendation to buy, that markets are risky, and they MUST do their own research or consult a qualified financial advisor."
                )
            else:
                 prompt_lines.append("Their expense-to-income ratio doesn't seem excessively high, so focus primarily on general or category-specific saving tips based on their data and personality type.")


        prompt_lines.append("---")
        prompt_lines.append("Your response:")
        final_prompt = "\n".join(prompt_lines)

        print(f"\n--- Sending Prompt to AI ---\n{final_prompt}\n---------------------------\n")
        ai_response = model.generate_content(final_prompt)
        
        if hasattr(ai_response, 'text'):
            response_text = ai_response.text
        elif isinstance(ai_response, str): # Fallback for simpler string responses
            response_text = ai_response
        else:
            print(f"Unexpected AI response structure: {type(ai_response)}")
            response_text = "Received an unexpected response format from the AI."


    except Exception as e:
        print(f"Error calling Google AI API or processing response: {e}")
        response_text = f"Sorry, an error occurred: {e}. Please check the logs or API configuration."

    return jsonify({'response': response_text})

# --- Financial Personality Quiz Routes ---
@app.route('/quiz', methods=['GET', 'POST'])
def personality_quiz():
    if request.method == 'POST':
        scores = {'Saver': 0, 'Spender': 0, 'Planner': 0, 'Adventurer': 0}
        # Questions are q1, q2, q3, q4, q5
        for i in range(1, 6):
            answer = request.form.get(f'q{i}')
            if answer and answer in scores: # Ensure answer is not None
                scores[answer] += 1
        
        if sum(scores.values()) > 0: # Check if any valid answer was submitted
            result = max(scores, key=scores.get)
        else:
            result = "Unknown" # Default if no valid answers

        session['quiz_result'] = result
        return redirect(url_for('quiz_result'))
    return render_template('quiz.html')

@app.route('/quiz_result')
def quiz_result():
    result = session.get('quiz_result', 'Unknown')
    advice_map = {
        'Saver': "You're great at stashing cash! Consider exploring low-risk investments to make your savings grow even faster. Don't forget to enjoy some of your hard-earned money too!",
        'Spender': "You know how to enjoy life! Try setting small, achievable savings goals for things you want. Tracking expenses for a week might reveal easy ways to save without feeling deprived.",
        'Planner': "You're organized and goal-oriented! Make sure your plans include an emergency fund. Periodically review and adjust your budget to stay on track with long-term goals.",
        'Adventurer': "You love experiences! Factor in a 'fun & travel' fund into your budget. Consider travel hacking or looking for deals to make your adventures more affordable.",
        'Unknown': "Something went wrong or you haven't taken the quiz yet. Please try taking the quiz!"
    }
    current_advice = advice_map.get(result, advice_map['Unknown'])
    return render_template('quiz_result.html', result=result, advice=current_advice)


# --- Savings Tracker Routes ---
@app.route('/savings', methods=['GET', 'POST'])
def savings_tracker_page():
    global challenge_id_counter, savings_challenges # Use global

    if request.method == 'POST':
        form_type = request.form.get('form_type')
        if form_type == 'new_challenge':
            name = request.form.get('goal_name')
            target_amount_str = request.form.get('target_amount')
            duration_days_str = request.form.get('duration_days') # Can be empty

            if not name or not target_amount_str:
                # Add flash messaging for better UX in a real app
                print("Error: Goal name or target amount missing.")
                return redirect(url_for('savings_tracker_page'))

            try:
                target_amount = float(target_amount_str)
                duration_days = int(duration_days_str) if duration_days_str and duration_days_str.isdigit() else 0
                if target_amount <= 0:
                     print("Error: Target amount must be positive.")
                     return redirect(url_for('savings_tracker_page'))
            except ValueError:
                print("Error: Invalid number for target amount or duration.")
                return redirect(url_for('savings_tracker_page'))

            challenge_id_counter += 1
            start_date = datetime.date.today()
            end_date_val = None
            if duration_days > 0:
                end_date_val = start_date + datetime.timedelta(days=duration_days)

            new_challenge = {
                'id': challenge_id_counter,
                'name': name,
                'target_amount': target_amount,
                'saved_so_far': 0.0,
                'start_date': start_date, # Store as datetime.date object
                'duration_days': duration_days,
                'end_date': end_date_val, # Store as datetime.date object or None
                'status': 'active'
            }
            savings_challenges.append(new_challenge)
            print(f"Added new challenge: {new_challenge}")
        return redirect(url_for('savings_tracker_page')) # Redirect after POST

    # Prepare challenges for GET request (calculate days_remaining)
    today = datetime.date.today()
    challenges_for_template = []
    for ch_data in savings_challenges:
        challenge = ch_data.copy() # Work with a copy
        if challenge['status'] == 'active':
            if challenge['end_date']: # end_date is a datetime.date object
                remaining_delta = challenge['end_date'] - today
                challenge['days_remaining'] = max(0, remaining_delta.days)
                challenge['end_date_obj_for_strftime'] = challenge['end_date']
            # elif challenge['duration_days'] > 0 and challenge.get('start_date'): # start_date is a datetime.date object
            #     elapsed_days = (today - challenge['start_date']).days
            #     challenge['days_remaining'] = max(0, challenge['duration_days'] - elapsed_days)
            #     challenge['end_date_obj_for_strftime'] = None # Or calculate potential end date for display
            else: # No specific end date, could be ongoing
                challenge['days_remaining'] = 'Ongoing'
                challenge['end_date_obj_for_strftime'] = None
        elif challenge['status'] == 'completed':
            challenge['days_remaining'] = 0
            challenge['end_date_obj_for_strftime'] = challenge.get('end_date')
        else: # Should not happen with current statuses
            challenge['days_remaining'] = 'N/A'
            challenge['end_date_obj_for_strftime'] = challenge.get('end_date')
        challenges_for_template.append(challenge)
            
    return render_template('savings_tracker.html', challenges=challenges_for_template)

@app.route('/api/add_savings_progress', methods=['POST'])
def api_add_savings_progress():
    global savings_challenges # Use global
    data = request.get_json()
    
    # Validate incoming data
    challenge_id = data.get('challenge_id')
    amount_added_str = data.get('amount_added')

    if challenge_id is None or amount_added_str is None:
        return jsonify({'success': False, 'message': 'Missing challenge_id or amount_added'}), 400
    
    try:
        challenge_id = int(challenge_id) # Ensure challenge_id is an int for comparison
        amount_added = float(amount_added_str)
        if amount_added <= 0:
            return jsonify({'success': False, 'message': 'Amount must be positive'}), 400
    except ValueError:
        return jsonify({'success': False, 'message': 'Invalid challenge_id or amount format'}), 400

    challenge_found = None
    for challenge in savings_challenges:
        if challenge['id'] == challenge_id:
            challenge_found = challenge
            break
    
    if not challenge_found:
        return jsonify({'success': False, 'message': 'Challenge not found'}), 404

    if challenge_found['status'] == 'completed':
        return jsonify({'success': False, 'message': 'Challenge already completed'}), 400

    challenge_found['saved_so_far'] += amount_added
    
    # Prepare data for JSON response (convert date objects to strings if necessary for JS)
    response_challenge = challenge_found.copy()

    if challenge_found['saved_so_far'] >= challenge_found['target_amount']:
        challenge_found['saved_so_far'] = challenge_found['target_amount'] 
        challenge_found['status'] = 'completed'
        response_challenge['days_remaining'] = 0 # For completed, days remaining is 0
    else:
        today = datetime.date.today()
        if challenge_found['end_date']: # end_date is a datetime.date object
            remaining_delta = challenge_found['end_date'] - today
            response_challenge['days_remaining'] = max(0, remaining_delta.days)
        # elif challenge_found['duration_days'] > 0 and challenge_found.get('start_date'):
        #     elapsed_days = (today - challenge_found['start_date']).days
        #     response_challenge['days_remaining'] = max(0, challenge_found['duration_days'] - elapsed_days)
        else:
            response_challenge['days_remaining'] = 'Ongoing'
    
    # Ensure date objects are converted to ISO format strings for JSON
    if isinstance(response_challenge.get('start_date'), datetime.date):
        response_challenge['start_date'] = response_challenge['start_date'].isoformat()
    if isinstance(response_challenge.get('end_date'), datetime.date):
        response_challenge['end_date'] = response_challenge['end_date'].isoformat()


    return jsonify({
        'success': True, 
        'message': 'Savings added successfully!',
        'challenge': response_challenge # Send the updated challenge back
    })

@app.route('/api/delete_challenge/<int:challenge_id>', methods=['POST'])
def api_delete_challenge(challenge_id):
    global savings_challenges # Use global

    challenge_to_delete_index = -1
    for i, challenge in enumerate(savings_challenges):
        if challenge['id'] == challenge_id:
            challenge_to_delete_index = i
            break
    
    if challenge_to_delete_index != -1:
        del savings_challenges[challenge_to_delete_index]
        print(f"Deleted challenge with ID: {challenge_id}")
        return jsonify({'success': True, 'message': 'Challenge deleted successfully.'})
    else:
        print(f"Attempted to delete non-existent challenge with ID: {challenge_id}")
        return jsonify({'success': False, 'message': 'Challenge not found.'}), 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, host='0.0.0.0', port=port)
