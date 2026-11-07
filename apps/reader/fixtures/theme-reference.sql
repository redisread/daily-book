-- Fixed dummy58 visual fixture; copies only displayed fields of one public8b record.
DELETE FROM quotes;DELETE FROM issues;DELETE FROM books;
INSERT INTO books(id,title,author,category,year,pages,rating,description,cover_title,cover_author) VALUES('theme-reference-book','论生命的短暂','塞内卡','哲学/斯多葛主义',49,128,9,'塞内卡在这篇斯多葛主义经典中指出，生命并非天然短暂，真正的问题是人们把大量时间交给欲望、应酬、焦虑和无休止的忙碌。只有重新掌握时间，把注意力投向值得追求的事，人才能真正拥有自己的生命。','论生命的短暂','塞内卡');
INSERT INTO issues(id,book_id,status,publication_date,issue_number,editor_note,body) VALUES('theme-reference','theme-reference-book','published','2026-08-08',129,'曼森让我们选择值得解决的问题，塞内卡则把尺度拉到一生：每一次无意识的消耗，都在替别人花掉自己的生命。今天读它，是为了把时间从日程表重新变回选择权。','BODY_NOT_FOR_SSR_THEME_REFERENCE');
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-reference-q0','theme-reference','生命并不短暂，是我们浪费了太多本来可以拥有的时间。','核心观点：时间的浪费',0);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-reference-q1','theme-reference','人们谨慎守护财产，却常常任由别人侵占自己最不可再生的时间。','核心观点：时间的所有权',1);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-reference-q2','theme-reference','忙碌不等于活得充实，许多奔波只是让人没有机会面对自己。','核心观点：忙碌的幻觉',2);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-reference-q3','theme-reference','总把生活推迟到未来的人，会在等待开始时耗尽一生。','核心观点：停止推迟',3);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-reference-q4','theme-reference','能够反思过去、把握现在并从容面对未来的人，才真正扩展了生命。','核心观点：完整地生活',4);
INSERT INTO books(id,title,description) VALUES('theme-private-book','THEME_PRIVATE_TITLE','THEME_PRIVATE_DESCRIPTION');
INSERT INTO issues(id,book_id,body,editor_note) VALUES('theme-draft','theme-private-book','THEME_PRIVATE_BODY','THEME_PRIVATE_NOTE');
INSERT INTO issues(id,book_id,status,publication_date,issue_number,body) VALUES('theme-withdrawn','theme-private-book','withdrawn','2026-11-06',999,'THEME_PRIVATE_BODY');
