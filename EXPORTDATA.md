1. Download this credentials.json file and place it in the root folder of the repository (the 241_final_project folder). Our .gitignore will ensure you don't accidentally push it back to GitHub.
2. Open your terminal in VSCode, ensure you are inside the 241_final_project folder, and run this command: npm install firestore-export-import
You may need to download node.js onto your computer if you have not already
3. In that same terminal, run: node export.js
4. Open the R script in RStudio. Make sure your working directory is set to the main 241_final_project folder. Run the code block. It will grab the new JSON file from the data_pipeline folder, flatten it, and instantly rebuild the experiment_master dataframe with the latest participants.

once you run all these steps, you can pull the data again just by opening the terminal in VSCode (making sure you are in the Claude folder) and running node export.js, and then it will be refelcted in the .rmd file in data_pipeline file