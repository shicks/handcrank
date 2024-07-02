(defun sdh-spec-fix-line ()
  "Fix the current line"
  (interactive)
  (let (comment)
    (save-excursion
      (beginning-of-line)
      ;; What kind of comment should we use?
      (save-excursion
        (previous-line)
        (cond
         ((looking-at " *\\* ?")
          (setq comment (match-string 0)))
         ((looking-at " *// ?")
          (setq comment (match-string 0)))
         ((looking-at "\\( *\\)/\\*\\*")
          (setq comment (concat (match-string 1) " * ")))
         (t
          (setq comment "// ?"))))
      (when (not (string-match " $" comment))
        (setq comment (concat comment " ")))
      ;; Look for "#. #." and delete one
      (when (looking-at "[0-9a-z]+\\. [0-9a-z]+\\. ")
        (delete-char (/ (length (match-string 0)) 2))
        (when (looking-at "[iv]") (save-excursion (insert "        ")))
        (when (looking-at "[a-hj-uw-z]") (save-excursion (insert "    "))))
      (when (not (looking-at " *[*/]"))
        (insert comment))
      ;; Fill long lines
      (when (looking-at " *[*/]")
        (sdh-fill-single-line)))
      ;; TODO - indent some, depending on context?
    (next-line)
))

(defun sdh-fill-single-line ()
  "Fill the current line and no others"
  (interactive)
  (next-line) (open-line 1) (previous-line) (open-line 1) (next-line)
  (fill-paragraph)
  (previous-line)
  (delete-char 1)
  (re-search-forward " *[*/]+ ?" (line-end-position))
  ;; Find any indent...?
  (let ((indent ""))
    (when (looking-at "[0-9a-iv]+\\. ")
      (setq indent (string-repeat " " (length (match-string 0)))))
    (next-line)
    (while (> (current-column) 0)
      (insert indent)
      (backward-char (length indent))
      (next-line)))
  (backward-delete-char 1))


(global-set-key (kbd "C-;") 'sdh-spec-fix-line)


(defun sdh-indent-comment-only ()
  "Indent just the comment character"
  (interactive)
  (save-excursion
    (insert "  ")
    (re-search-forward " *[*/]+")
    (when (looking-at "  ") (delete-char 2))))
(global-set-key (kbd "C-]") 'sdh-indent-comment-only)
